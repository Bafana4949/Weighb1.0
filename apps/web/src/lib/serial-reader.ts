/**
 * Web Serial Mettler Toledo Stream Processor and Connection Manager
 * Metrology compliant, non-blocking, framing/parity error recoverable.
 */

export interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  open?(options: any): Promise<void>;
  close?(): Promise<void>;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
}

export interface ReaderLoopOptions {
  framing?: "8-none" | "7-even" | "7-odd";
  signal?: AbortSignal;
  onFrame?: (rawFrame: string) => void;
  onWeight?: (weight: { weightKg: number; isStable: boolean }) => void;
  onRecoverableError?: (err: any) => void;
  onReader?: (reader: ReadableStreamDefaultReader<Uint8Array> | null) => void;
}

export function parseMettlerWeight(raw: string): { weightKg: number; isStable: boolean } | null {
  if (!raw) return null;

  // 1. Toledo Continuous Protocol: STX <SWA><SWB><SWC><6 chars indicated weight><6 chars tare><CR>
  const stxIndex = raw.indexOf("\x02");
  if (stxIndex !== -1) {
    const sub = raw.slice(stxIndex);
    if (sub.length >= 10) {
      const swa = sub.charCodeAt(1) & 0x7f;
      const swb = sub.charCodeAt(2) & 0x7f;

      // Bit 5 is always 1 on valid Toledo status words (0x20)
      const isStandardToledo = (swa & 0x20) !== 0 && (swb & 0x20) !== 0;
      const isStable = isStandardToledo ? (swb & 0x08) === 0 : true;
      const isKg = isStandardToledo ? (swb & 0x10) !== 0 : true;
      const outOfRange = isStandardToledo ? (swb & 0x04) !== 0 : false;

      // Metrology safety: reject out of range or non-kg
      if (outOfRange || !isKg) return null;

      const digits = sub.slice(4, 10).trim();
      if (/^\d{1,6}$/.test(digits)) {
        const val = parseInt(digits, 10);
        if (Number.isSafeInteger(val) && val >= 0) {
          return { weightKg: val, isStable };
        }
      }
    }
  }

  const cleaned = raw.replace(/[^\x20-\x7E]/g, " ").trim();
  if (!cleaned) return null;

  // 2. MT-SICS command format (e.g. "S S 2200 kg" = stable, "S D 2200 kg" = dynamic)
  const sicsMatch = cleaned.match(/(?:S\s+([SDI])|ST\s*,\s*GS\s*,?\s*[+-]?|Net|Gross|WT:?)\s*([+-]?\s*\d+(?:\.\d+)?)/i);
  if (sicsMatch && sicsMatch[2]) {
    const statusCode = sicsMatch[1]?.toUpperCase();
    const isStable = statusCode === "S" || statusCode === undefined;
    const candidate = parseFloat(sicsMatch[2].replace(/\s+/g, ""));
    if (!isNaN(candidate) && candidate >= 0) {
      return { weightKg: Math.round(candidate), isStable };
    }
  }

  // 3. Explicit unit match (e.g. "2200 kg")
  const kgMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:kg|t\b)/i);
  if (kgMatch && kgMatch[1]) {
    const candidate = parseFloat(kgMatch[1]);
    if (!isNaN(candidate) && candidate >= 0) {
      return { weightKg: Math.round(candidate), isStable: true };
    }
  }

  // 4. Prefix match (e.g. "WN: 2200", "G: 2200", "W: 2200")
  const prefixMatch = cleaned.match(/(?:WN|G|W|N|GROSS|NET)\s*[:=]?\s*([+-]?\s*\d+(?:\.\d+)?)/i);
  if (prefixMatch && prefixMatch[1]) {
    const candidate = parseFloat(prefixMatch[1].replace(/\s+/g, ""));
    if (!isNaN(candidate) && candidate >= 0) {
      return { weightKg: Math.round(candidate), isStable: true };
    }
  }

  // 5. Bare positive integer match (e.g. "+024500", " 24500 ", "0")
  const bareMatch = cleaned.match(/^[+-]?\s*(\d{1,7})$/);
  if (bareMatch && bareMatch[1]) {
    const val = parseInt(bareMatch[1], 10);
    if (!isNaN(val) && val >= 0) {
      return { weightKg: val, isStable: true };
    }
  }

  // 6. Space-separated multi-column telemetry (e.g. "10     00    00" or "02 34500 00")
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const numbers = tokens
      .map((t) => parseInt(t, 10))
      .filter((n) => !isNaN(n) && n >= 0 && n <= 150000);
    if (numbers.length >= 2) {
      const maxVal = Math.max(...numbers);
      return { weightKg: maxVal, isStable: true };
    }
  }

  return null;
}

/**
 * Runs the cooperative serial stream reader loop.
 * Recovers across transient parity/framing errors under W3C Web Serial spec.
 * Breaks immediately if getReader() throws to prevent infinite main-thread lockups.
 */
export async function runReaderLoop(
  port: SerialPortLike,
  options: ReaderLoopOptions = {}
): Promise<void> {
  const framing = options.framing ?? "8-none";
  const dataBits = framing.startsWith("7") ? 7 : 8;
  const parity = framing.endsWith("even") ? "even" : framing.endsWith("odd") ? "odd" : "none";
  const mask = dataBits === 7 || parity !== "none" ? 0x7f : 0xff;

  let buffer = "";

  while (port.readable && !options.signal?.aborted) {
    let reader: ReadableStreamDefaultReader<Uint8Array>;

    try {
      reader = port.readable.getReader();
      options.onReader?.(reader);
    } catch (err) {
      options.onRecoverableError?.(err);
      break;
    }

    const onAbort = () => {
      try {
        reader.cancel().catch(() => {});
      } catch {}
    };

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    let isStreamDone = false;
    try {
      for (;;) {
        if (options.signal?.aborted) break;

        const { value, done } = await reader.read();
        if (done) {
          isStreamDone = true;
          break;
        }

        if (value && value.length > 0) {
          let chunk = "";
          for (let i = 0; i < value.length; i++) {
            const byte = value[i];
            if (byte !== undefined) {
              chunk += String.fromCharCode(byte & mask);
            }
          }
          buffer += chunk;

          if (buffer.includes("\r") || buffer.includes("\n") || buffer.length > 64) {
            const stxIndex = buffer.lastIndexOf("\x02");
            const crIndex = buffer.lastIndexOf("\r");
            if (stxIndex !== -1 && crIndex > stxIndex) {
              const frame = buffer.substring(stxIndex, crIndex + 1);
              options.onFrame?.(frame);
              const parsed = parseMettlerWeight(frame);
              if (parsed !== null) options.onWeight?.(parsed);
              buffer = buffer.substring(crIndex + 1);
            } else {
              const lines = buffer.split(/[\r\n]+/);
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                options.onFrame?.(trimmed);
                const parsed = parseMettlerWeight(trimmed);
                if (parsed !== null) options.onWeight?.(parsed);
              }
            }
          }
        }
      }
      if (isStreamDone) break;
    } catch (streamErr: any) {
      // Under Web Serial spec, framing/parity error rejects read(), but replaces port.readable
      options.onRecoverableError?.(streamErr);
      if (options.signal?.aborted) break;
    } finally {
      if (options.signal) {
        try {
          options.signal.removeEventListener("abort", onAbort);
        } catch {}
      }
      try {
        reader?.releaseLock();
      } catch {}
      options.onReader?.(null);
    }
  }
}

export interface OpenRetryOptions {
  /** Wait (ms) after each failed attempt; the number of entries sets the attempt count. */
  delays?: readonly number[];
  /** Checked before every attempt; returning true stops retrying (unmount, manual disconnect). */
  shouldAbort?: () => boolean;
  onAttemptFailed?: (attempt: number, err: any) => void;
  sleep?: (ms: number) => Promise<void>;
}

/** Fast-then-slower backoff: Windows COM drivers (FTDI/CH340/PL2303/CP210x) release the handle 0.2–1.5s after reload. */
export const DEFAULT_OPEN_RETRY_DELAYS = [100, 150, 200, 250, 300, 400, 500, 500, 750, 1000, 1500, 2000] as const;

function isAlreadyOpenError(err: any): boolean {
  return err?.name === "InvalidStateError" || /already open/i.test(String(err?.message ?? err));
}

/**
 * Opens a previously authorised port, retrying while the OS still holds the COM handle from the
 * previous document. A port left dangling in an open state is closed before the next attempt.
 * Resolves true once the port is open with an unlocked readable stream.
 */
export async function openPortWithRetry(
  port: SerialPortLike,
  openOptions: { baudRate: number; dataBits: number; stopBits: number; parity: string },
  options: OpenRetryOptions = {}
): Promise<boolean> {
  const delays = options.delays ?? DEFAULT_OPEN_RETRY_DELAYS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (options.shouldAbort?.()) return false;

    if (port.readable) {
      // Already open in this document. A locked stream means an old reader still owns it; wait for teardown.
      if (!port.readable.locked) return true;
      options.onAttemptFailed?.(attempt + 1, new Error("Serial readable stream is locked"));
    } else {
      try {
        await port.open?.(openOptions);
        if (options.shouldAbort?.()) {
          await port.close?.().catch(() => {});
          return false;
        }
        return true;
      } catch (err) {
        options.onAttemptFailed?.(attempt + 1, err);
        if (isAlreadyOpenError(err)) {
          await port.close?.().catch(() => {});
        }
      }
    }

    if (attempt < delays.length - 1) await sleep(delays[attempt]!);
  }
  return false;
}

/**
 * Ordered teardown required by the Streams spec: cancel the reader, release its lock, then close the
 * port (close() rejects while the readable is locked). Never throws.
 */
export async function releaseSerialPort(
  port: SerialPortLike | null | undefined,
  reader?: ReadableStreamDefaultReader<Uint8Array> | null
): Promise<void> {
  if (reader) {
    try {
      await reader.cancel();
    } catch {}
    try {
      reader.releaseLock();
    } catch {}
  }
  if (port) {
    try {
      await port.close?.();
    } catch {}
  }
}

export type SerialFraming = "8-none" | "7-even" | "7-odd";

export interface SerialProfile {
  baud: number;
  framing: SerialFraming;
}

/** Common continuous-output indicator settings, most likely first. */
export const SCALE_PROFILES: readonly (SerialProfile & { label: string })[] = [
  { baud: 9600, framing: "7-even", label: "9600 baud, 7-E-1 (Mettler Toledo Continuous)" },
  { baud: 9600, framing: "8-none", label: "9600 baud, 8-N-1 (Standard Continuous)" },
  { baud: 4800, framing: "7-even", label: "4800 baud, 7-E-1 (Mettler Toledo 4800)" },
  { baud: 4800, framing: "8-none", label: "4800 baud, 8-N-1 (Avery / Rice Lake)" },
  { baud: 2400, framing: "7-even", label: "2400 baud, 7-E-1" },
  { baud: 19200, framing: "8-none", label: "19200 baud, 8-N-1" },
];

export function toOpenOptions(profile: SerialProfile) {
  const dataBits = profile.framing.startsWith("7") ? 7 : 8;
  const parity = profile.framing.endsWith("even") ? "even" : profile.framing.endsWith("odd") ? "odd" : "none";
  return { baudRate: profile.baud, dataBits, stopBits: 1, parity };
}

export interface ProbeOptions {
  /** How long to listen for weight frames. Continuous indicators send 5–20 frames/s. */
  timeoutMs?: number;
  /** Valid weight frames required before the port counts as a scale (guards against line noise). */
  minFrames?: number;
  /** Open retry policy; defaults to a single attempt. */
  openRetry?: OpenRetryOptions;
}

export type ProbeResult = "match" | "no-data" | "open-failed";

/**
 * Opens the port with one profile and listens for valid weight frames.
 * On "match" the port is left OPEN with its reader released, ready for runReaderLoop.
 * Otherwise the port is closed again.
 */
export async function probePortProfile(
  port: SerialPortLike,
  profile: SerialProfile,
  options: ProbeOptions = {}
): Promise<ProbeResult> {
  const timeoutMs = options.timeoutMs ?? 1000;
  const minFrames = options.minFrames ?? 1;
  const openOptions = toOpenOptions(profile);

  // A port still open from an earlier session in this document must be reopened with this profile
  if (port.readable && !port.readable.locked) await releaseSerialPort(port);

  const opened = await openPortWithRetry(port, openOptions, { delays: [0], ...options.openRetry });
  if (!opened || !port.readable) return "open-failed";

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = port.readable.getReader();
  } catch {
    await releaseSerialPort(port);
    return "open-failed";
  }

  const mask = openOptions.dataBits === 7 || openOptions.parity !== "none" ? 0x7f : 0xff;
  const deadline = Date.now() + timeoutMs;
  let buffer = "";
  let frames = 0;
  let pendingRead: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;

  try {
    while (Date.now() < deadline && frames < minFrames) {
      pendingRead ??= reader.read();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        pendingRead,
        new Promise<null>((res) => {
          timer = setTimeout(() => res(null), Math.max(0, deadline - Date.now()));
        }),
      ]);
      clearTimeout(timer);
      if (result === null) break; // listen window elapsed
      pendingRead = null;
      if (result.done) break;

      const value = result.value;
      if (!value) continue;
      for (let i = 0; i < value.length; i++) buffer += String.fromCharCode(value[i]! & mask);

      if (buffer.includes("\r") || buffer.includes("\n") || buffer.length > 64) {
        const stxIndex = buffer.lastIndexOf("\x02");
        const crIndex = buffer.lastIndexOf("\r");
        if (stxIndex !== -1 && crIndex > stxIndex) {
          const frame = buffer.substring(stxIndex, crIndex + 1);
          if (parseMettlerWeight(frame) !== null) frames++;
          buffer = buffer.substring(crIndex + 1);
        } else {
          const parts = buffer.split(/[\r\n]+/);
          buffer = parts.pop() ?? "";
          for (const line of parts) {
            if (line.trim() && parseMettlerWeight(line) !== null) frames++;
          }
        }
      }
      if (buffer.length > 256) buffer = buffer.slice(-128);
    }
  } catch {
    // Parity/framing errors while listening simply mean this profile is wrong
  }

  if (frames >= minFrames) {
    try {
      await reader.cancel();
    } catch {}
    try {
      reader.releaseLock();
    } catch {}
    return "match";
  }

  await releaseSerialPort(port, reader);
  return "no-data";
}

export interface FindScaleOptions {
  /** Last profile that worked; tried first on every port. */
  preferredProfile?: SerialProfile;
  /** Ports matching this (e.g. saved USB vendor/product id) are scanned first, with open retries. */
  isPreferredPort?: (port: SerialPortLike) => boolean;
  shouldAbort?: () => boolean;
  probe?: Omit<ProbeOptions, "openRetry">;
  /** Retry policy for opening the preferred port (covers Windows COM release after F5). */
  preferredOpenRetry?: OpenRetryOptions;
}

/**
 * Scans every available port and every common profile until one produces valid weight frames.
 * Resolves with the port left open and the matching profile, or null if no scale is streaming.
 */
export async function findScalePort<P extends SerialPortLike>(
  ports: readonly P[],
  options: FindScaleOptions = {}
): Promise<{ port: P; profile: SerialProfile } | null> {
  const isPreferred = options.isPreferredPort ?? (() => false);
  const ordered = [...ports.filter((p) => isPreferred(p)), ...ports.filter((p) => !isPreferred(p))];

  const profiles: SerialProfile[] = [];
  for (const p of [options.preferredProfile, ...SCALE_PROFILES]) {
    if (p && !profiles.some((q) => q.baud === p.baud && q.framing === p.framing)) {
      profiles.push({ baud: p.baud, framing: p.framing });
    }
  }

  for (const port of ordered) {
    const preferred = isPreferred(port);
    for (let i = 0; i < profiles.length; i++) {
      if (options.shouldAbort?.()) return null;
      const profile = profiles[i]!;
      const openRetry =
        preferred && i === 0
          ? {
              ...options.preferredOpenRetry,
              delays: options.preferredOpenRetry?.delays ?? DEFAULT_OPEN_RETRY_DELAYS,
              shouldAbort: options.shouldAbort,
            }
          : { delays: [0], shouldAbort: options.shouldAbort };

      const result = await probePortProfile(port, profile, { ...options.probe, openRetry });
      if (result === "match") {
        if (options.shouldAbort?.()) {
          await releaseSerialPort(port);
          return null;
        }
        return { port, profile };
      }
      // Busy or unusable port (held by another program, Bluetooth stub, …): skip its other profiles
      if (result === "open-failed") break;
    }
  }
  return null;
}
