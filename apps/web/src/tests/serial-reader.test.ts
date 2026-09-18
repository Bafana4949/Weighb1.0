import { describe, expect, it, vi } from "vitest";
import { runReaderLoop, parseMettlerWeight, SerialPortLike } from "@/lib/serial-reader";

describe("Web Serial runReaderLoop & Mettler Toledo Protocol Parser", () => {
  it("terminates immediately if getReader() throws (prevents main thread freeze)", async () => {
    let getReaderCalls = 0;
    const fakePort: SerialPortLike = {
      readable: {
        getReader: () => {
          getReaderCalls++;
          throw new TypeError("Failed to execute 'getReader' on 'ReadableStream': ReadableStream is locked");
        },
      } as any,
    };

    let recoverableErrors: any[] = [];
    await runReaderLoop(fakePort, {
      onRecoverableError: (err) => recoverableErrors.push(err),
    });

    expect(getReaderCalls).toBe(1); // Exited immediately, never spun in a tight loop!
    expect(recoverableErrors.length).toBe(1);
  });

  it("recovers from recoverable framing/parity error on the serial stream", async () => {
    let streamIndex = 0;
    const weights: number[] = [];

    // Simulate W3C Web Serial behavior: port.readable is replaced with a new stream upon line error
    const createStream = (id: number) => {
      let readCount = 0;
      return {
        getReader: () => ({
          read: async () => {
            readCount++;
            if (id === 0 && readCount === 1) {
              const err = new Error("Framing error detected on RS-232 line");
              err.name = "FramingError";
              // Simulate port automatically switching to fresh stream
              currentReadable = createStream(1);
              throw err;
            }
            if (id === 1 && readCount === 1) {
              // Valid Toledo continuous frame: STX <SWA><SWB><SWC> 34500  14500<CR>
              // SWA: 0x20, SWB: 0x30 (kg, stable, in range), SWC: 0x20
              const frame = "\x02\x20\x30\x20 34500 14500\r";
              const encoder = new TextEncoder();
              return { value: encoder.encode(frame), done: false };
            }
            return { value: undefined, done: true };
          },
          releaseLock: vi.fn(),
        }),
      };
    };

    let currentReadable: any = createStream(0);
    const fakePort: SerialPortLike = {
      get readable() {
        return currentReadable;
      },
    };

    const abortController = new AbortController();

    await runReaderLoop(fakePort, {
      signal: abortController.signal,
      onWeight: (w) => {
        weights.push(w.weightKg);
        abortController.abort(); // Stop after receiving recovered weight
      },
    });

    expect(weights).toEqual([34500]);
  });

  it("parseMettlerWeight correctly parses Toledo and MT-SICS frames", () => {
    // 1. Toledo Continuous
    const toledoFrame = "\x02\x20\x30\x20 48200 14200\r";
    const toledoParsed = parseMettlerWeight(toledoFrame);
    expect(toledoParsed).not.toBeNull();
    expect(toledoParsed?.weightKg).toBe(48200);
    expect(toledoParsed?.isStable).toBe(true);

    // 2. MT-SICS Stable ("S S 34500 kg")
    const sicsStable = parseMettlerWeight("S S 34500 kg\r\n");
    expect(sicsStable).toEqual({ weightKg: 34500, isStable: true });

    // 3. MT-SICS Dynamic/In-Motion ("S D 22100 kg")
    const sicsMotion = parseMettlerWeight("S D 22100 kg\r\n");
    expect(sicsMotion).toEqual({ weightKg: 22100, isStable: false });

    // 4. Corrupt / Empty
    expect(parseMettlerWeight("")).toBeNull();
    expect(parseMettlerWeight("ERROR")).toBeNull();
  });

  it("cancels pending reader.read() immediately when abort signal fires (prevents disconnect hang)", async () => {
    let cancelCalled = false;
    let pendingReadResolve: ((val: any) => void) | null = null;

    const fakePort: SerialPortLike = {
      readable: {
        getReader: () => ({
          read: () => {
            return new Promise((resolve) => {
              pendingReadResolve = resolve;
            });
          },
          cancel: vi.fn(async () => {
            cancelCalled = true;
            if (pendingReadResolve) {
              pendingReadResolve({ value: undefined, done: true });
            }
          }),
          releaseLock: vi.fn(),
        }),
      } as any,
    };

    const abortController = new AbortController();
    const loopPromise = runReaderLoop(fakePort, {
      signal: abortController.signal,
    });

    // Abort while read() is blocking indefinitely
    setTimeout(() => {
      abortController.abort();
    }, 20);

    // If cancel() isn't called on abort, this promise would hang forever
    await loopPromise;

    expect(cancelCalled).toBe(true);
  });
});
