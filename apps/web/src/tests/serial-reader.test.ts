import { describe, expect, it, vi } from "vitest";
import { runReaderLoop, parseMettlerWeight, openPortWithRetry, releaseSerialPort, probePortProfile, findScalePort, SerialPortLike, SerialProfile } from "@/lib/serial-reader";

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

  it("calls onReader callback when stream reader is acquired and released", async () => {
    const mockReleaseLock = vi.fn();
    const abortController = new AbortController();
    const fakePort: SerialPortLike = {
      readable: {
        getReader: () => ({
          read: async () => {
            abortController.abort();
            return { value: undefined, done: true };
          },
          cancel: vi.fn(),
          releaseLock: mockReleaseLock,
        }),
      } as any,
    };

    const readersCaptured: any[] = [];
    await runReaderLoop(fakePort, {
      signal: abortController.signal,
      onReader: (r) => readersCaptured.push(r),
    });

    expect(readersCaptured.length).toBe(2);
    expect(readersCaptured[0]).not.toBeNull();
    expect(readersCaptured[1]).toBeNull();
    expect(mockReleaseLock).toHaveBeenCalled();
  });
});

describe("openPortWithRetry (page refresh COM handle contention)", () => {
  const openOptions = { baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" };
  const noSleep = async () => {};

  it("retries while Windows still holds the COM handle, then succeeds", async () => {
    let calls = 0;
    const port: SerialPortLike = {
      readable: null,
      open: vi.fn(async () => {
        calls++;
        if (calls < 4) throw Object.assign(new Error("Failed to open serial port."), { name: "NetworkError" });
      }),
      close: vi.fn(async () => {}),
    };

    const opened = await openPortWithRetry(port, openOptions, { sleep: noSleep });

    expect(opened).toBe(true);
    expect(port.open).toHaveBeenCalledTimes(4);
    expect(port.close).not.toHaveBeenCalled();
  });

  it("closes a dangling handle when open() reports InvalidStateError before retrying", async () => {
    let calls = 0;
    const port: SerialPortLike = {
      readable: null,
      open: vi.fn(async () => {
        calls++;
        if (calls === 1) throw Object.assign(new Error("The port is already open."), { name: "InvalidStateError" });
      }),
      close: vi.fn(async () => {}),
    };

    expect(await openPortWithRetry(port, openOptions, { sleep: noSleep })).toBe(true);
    expect(port.close).toHaveBeenCalledTimes(1);
  });

  it("reuses a port already open with an unlocked stream, but waits on a locked one", async () => {
    const unlocked: SerialPortLike = { readable: { locked: false } as any, open: vi.fn() };
    expect(await openPortWithRetry(unlocked, openOptions, { sleep: noSleep })).toBe(true);
    expect(unlocked.open).not.toHaveBeenCalled();

    const locked: SerialPortLike = { readable: { locked: true } as any, open: vi.fn() };
    expect(await openPortWithRetry(locked, openOptions, { sleep: noSleep, delays: [1, 1, 1] })).toBe(false);
    expect(locked.open).not.toHaveBeenCalled();
  });

  it("stops retrying once aborted (manual disconnect / unmount) and closes a port opened after abort", async () => {
    let aborted = false;
    const port: SerialPortLike = {
      readable: null,
      open: vi.fn(async () => {
        aborted = true;
      }),
      close: vi.fn(async () => {}),
    };

    expect(await openPortWithRetry(port, openOptions, { sleep: noSleep, shouldAbort: () => aborted })).toBe(false);
    expect(port.close).toHaveBeenCalledTimes(1);
  });

  it("gives up after the configured number of attempts", async () => {
    const port: SerialPortLike = {
      readable: null,
      open: vi.fn(async () => {
        throw new Error("Access denied");
      }),
    };
    const sleep = vi.fn(async () => {});

    expect(await openPortWithRetry(port, openOptions, { sleep, delays: [10, 20, 30] })).toBe(false);
    expect(port.open).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c: any[]) => c[0])).toEqual([10, 20]);
  });
});

describe("releaseSerialPort", () => {
  it("cancels, releases the lock, then closes the port in order and never throws", async () => {
    const order: string[] = [];
    const reader = {
      cancel: vi.fn(async () => {
        order.push("cancel");
        throw new Error("already cancelled");
      }),
      releaseLock: vi.fn(() => {
        order.push("releaseLock");
      }),
    } as any;
    const port: SerialPortLike = {
      readable: null,
      close: vi.fn(async () => {
        order.push("close");
        throw new Error("InvalidStateError");
      }),
    };

    await expect(releaseSerialPort(port, reader)).resolves.toBeUndefined();
    expect(order).toEqual(["cancel", "releaseLock", "close"]);
  });
});

// Toledo continuous frame: STX, SWA, SWB (kg, stable), SWC, 6-digit weight, 6-digit tare, CR
const TOLEDO_FRAME = "\x02!0 024500000000\r";

/** Fake Web Serial port: streams TOLEDO_FRAME only when opened with `streamsAt`; silent otherwise. */
function fakePort(opts: { streamsAt?: SerialProfile; openFails?: boolean; usbVendorId?: number } = {}) {
  let isOpen = false;
  let stream: ReadableStream<Uint8Array> | null = null;

  const makeStream = (o: any) => {
    const matches =
      !!opts.streamsAt &&
      o.baudRate === opts.streamsAt.baud &&
      o.dataBits === (opts.streamsAt.framing.startsWith("7") ? 7 : 8) &&
      o.parity === (opts.streamsAt.framing.endsWith("even") ? "even" : opts.streamsAt.framing.endsWith("odd") ? "odd" : "none");
    return new ReadableStream<Uint8Array>({
      pull: (controller) =>
        matches
          ? new Promise<void>((res) => setTimeout(() => {
              controller.enqueue(new TextEncoder().encode(TOLEDO_FRAME));
              res();
            }, 2))
          : new Promise<void>(() => {}), // silent line
      // Like Chromium, a cancelled readable is replaced by a fresh one while the port stays open
      cancel: () => {
        if (isOpen) stream = makeStream(o);
      },
    });
  };

  const port = {
    get readable() {
      return isOpen ? stream : null;
    },
    open: vi.fn(async (o: any) => {
      if (opts.openFails) throw Object.assign(new Error("Failed to open serial port."), { name: "NetworkError" });
      if (isOpen) throw Object.assign(new Error("The port is already open."), { name: "InvalidStateError" });
      isOpen = true;
      stream = makeStream(o);
    }),
    close: vi.fn(async () => {
      if (stream?.locked) throw new TypeError("Cannot close a port while its readable stream is locked");
      isOpen = false;
      stream = null;
    }),
    getInfo: () => ({ usbVendorId: opts.usbVendorId }),
  };
  return port;
}

describe("probePortProfile", () => {
  it("returns match and leaves the port open and unlocked when weight frames arrive", async () => {
    const port = fakePort({ streamsAt: { baud: 9600, framing: "7-even" } });

    expect(await probePortProfile(port, { baud: 9600, framing: "7-even" }, { timeoutMs: 500 })).toBe("match");
    expect(port.readable).not.toBeNull();
    expect(port.readable!.locked).toBe(false);
  });

  it("returns no-data and closes the port when the profile is wrong", async () => {
    const port = fakePort({ streamsAt: { baud: 4800, framing: "7-even" } });

    expect(await probePortProfile(port, { baud: 9600, framing: "8-none" }, { timeoutMs: 40 })).toBe("no-data");
    expect(port.readable).toBeNull();
  });

  it("returns open-failed when the port is held by another program", async () => {
    const port = fakePort({ openFails: true });
    expect(await probePortProfile(port, { baud: 9600, framing: "8-none" }, { timeoutMs: 40 })).toBe("open-failed");
  });
});

describe("findScalePort (scan every port for the indicator)", () => {
  it("skips silent and busy ports and finds the scale at its own baud/framing", async () => {
    const printer = fakePort();
    const busy = fakePort({ openFails: true });
    const scale = fakePort({ streamsAt: { baud: 4800, framing: "7-even" } });

    const found = await findScalePort([printer, busy, scale], { probe: { timeoutMs: 40 } });

    expect(found?.port).toBe(scale);
    expect(found?.profile).toEqual({ baud: 4800, framing: "7-even" });
    expect(busy.open).toHaveBeenCalledTimes(1); // busy port is not retried for every profile
    expect(printer.readable).toBeNull(); // non-scale ports are closed again
    expect(scale.readable).not.toBeNull();
  });

  it("tries the remembered port and profile first so a refresh reconnects on the first probe", async () => {
    const other = fakePort();
    const scale = fakePort({ streamsAt: { baud: 9600, framing: "8-none" }, usbVendorId: 1027 });

    const found = await findScalePort([other, scale], {
      preferredProfile: { baud: 9600, framing: "8-none" },
      isPreferredPort: (p: any) => p.getInfo().usbVendorId === 1027,
      probe: { timeoutMs: 500 },
    });

    expect(found?.port).toBe(scale);
    expect(scale.open).toHaveBeenCalledTimes(1);
    expect(other.open).not.toHaveBeenCalled();
  });

  it("retries opening the remembered port while Windows still holds the COM handle after F5", async () => {
    const scale = fakePort({ streamsAt: { baud: 9600, framing: "7-even" } });
    const realOpen = scale.open.getMockImplementation()!;
    let attempts = 0;
    scale.open.mockImplementation(async (o: any) => {
      if (++attempts < 3) throw Object.assign(new Error("Access denied."), { name: "NetworkError" });
      return realOpen(o);
    });

    const found = await findScalePort([scale], {
      preferredProfile: { baud: 9600, framing: "7-even" },
      isPreferredPort: () => true,
      preferredOpenRetry: { delays: [1, 1, 1, 1] },
      probe: { timeoutMs: 500 },
    });

    expect(found?.port).toBe(scale);
    expect(attempts).toBe(3);
  });

  it("returns null when no port streams weight, and stops when aborted", async () => {
    expect(await findScalePort([fakePort(), fakePort()], { probe: { timeoutMs: 10 } })).toBeNull();

    const scale = fakePort({ streamsAt: { baud: 9600, framing: "7-even" } });
    expect(await findScalePort([scale], { shouldAbort: () => true })).toBeNull();
    expect(scale.open).not.toHaveBeenCalled();
  });
});
