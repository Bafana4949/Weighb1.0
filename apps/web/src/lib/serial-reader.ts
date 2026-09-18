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

    try {
      for (;;) {
        if (options.signal?.aborted) break;

        const { value, done } = await reader.read();
        if (done) break;

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
    }
  }
}
