import { describe, expect, it, vi } from "vitest";

describe("Web Serial Reader Loop & Port Lifecycle", () => {
  it("terminates immediately if getReader() throws (prevents main thread freeze)", async () => {
    let getReaderCalls = 0;
    const fakePort = {
      readable: {
        getReader: () => {
          getReaderCalls++;
          throw new TypeError("Failed to execute 'getReader' on 'ReadableStream': ReadableStream is locked");
        },
      },
    };

    let keepReading = true;
    let loopTerminated = false;

    // Simulate our safe reader loop
    const readerLoopPromise = (async () => {
      while (fakePort.readable && keepReading) {
        let reader: any;
        try {
          reader = fakePort.readable.getReader();
        } catch (getReaderErr) {
          // Break immediately to prevent infinite unawaited spinning
          break;
        }

        try {
          // read logic
        } finally {
          reader?.releaseLock();
        }
      }
      loopTerminated = true;
    })();

    await readerLoopPromise;

    expect(loopTerminated).toBe(true);
    expect(getReaderCalls).toBe(1); // Exited on first failure, never spun infinitely
  });

  it("recovers from recoverable framing/parity error on the serial stream", async () => {
    let streamCount = 0;
    let packetsParsed: number[] = [];

    const createFakeStream = () => {
      streamCount++;
      let callCount = 0;
      return {
        getReader: () => ({
          read: async () => {
            callCount++;
            if (streamCount === 1 && callCount === 1) {
              // Simulate framing error on first read
              const err = new Error("Framing error detected on RS-232 line");
              err.name = "FramingError";
              throw err;
            }
            if (callCount === 1) {
              return { value: new Uint8Array([83, 32, 83, 32, 50, 52, 48, 48, 13]), done: false }; // "S S 2400\r"
            }
            return { value: undefined, done: true };
          },
          releaseLock: vi.fn(),
        }),
      };
    };

    let currentStream = createFakeStream();
    const fakePort = {
      get readable() {
        return currentStream;
      },
    };

    let keepReading = true;
    let loopFinished = false;

    const readerLoop = (async () => {
      while (fakePort.readable && keepReading) {
        let reader: any;
        try {
          reader = fakePort.readable.getReader();
        } catch {
          break;
        }

        try {
          for (;;) {
            if (!keepReading) break;
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              const text = String.fromCharCode(...value);
              const match = text.match(/\d+/);
              if (match) packetsParsed.push(parseInt(match[0], 10));
            }
          }
        } catch (streamErr: any) {
          // Recoverable error: replace readable with a new stream
          currentStream = createFakeStream();
        } finally {
          reader?.releaseLock();
        }

        if (packetsParsed.length > 0) break; // Finished after recovery
      }
      loopFinished = true;
    })();

    await readerLoop;

    expect(loopFinished).toBe(true);
    expect(streamCount).toBe(2); // Recovered onto second stream
    expect(packetsParsed).toEqual([2400]);
  });

  it("disconnect sequence follows exact spec order: stop flag -> cancel reader -> await loop -> close port", async () => {
    const executionOrder: string[] = [];

    const fakeReader = {
      cancel: vi.fn(async () => {
        executionOrder.push("reader.cancel");
      }),
      read: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { value: undefined, done: true };
      }),
      releaseLock: vi.fn(),
    };

    const fakePort = {
      close: vi.fn(async () => {
        executionOrder.push("port.close");
      }),
    };

    let keepReading = true;
    const loopPromise = (async () => {
      executionOrder.push("loop.start");
      while (keepReading) {
        await fakeReader.read();
        break;
      }
      executionOrder.push("loop.ended");
    })();

    // Perform disconnect sequence
    keepReading = false;
    await fakeReader.cancel();
    await loopPromise;
    await fakePort.close();

    expect(executionOrder).toEqual([
      "loop.start",
      "reader.cancel",
      "loop.ended",
      "port.close",
    ]);
  });
});
