"use client";
import { useState } from "react";
import type { HardwareDeviceType } from "@prisma/client";
import { Activity, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseMettlerWeight, toOpenOptions, type SerialFraming } from "@/lib/serial-reader";
import { scanCard } from "@/lib/card-scanner";

type LiveResult = { method: "WEB_SERIAL_READ" | "NFC_BRIDGE_READ"; passed: boolean; detail: string; rawSample?: string; parsed?: Record<string, string | number | boolean | null> };

/**
 * Browser-side, read-only device tests for hardware the browser itself talks to.
 * The scale test only listens to the indicator's continuous output; it never writes
 * to the port, never touches gates, and never creates a transaction.
 */
export function DeviceLiveTest({ device, onResult }: { device: { type: HardwareDeviceType; connectionType: string; configuration: Record<string, unknown> }; onResult: (r: LiveResult) => void }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  if (device.type === "SCALE" && device.connectionType === "WEB_SERIAL") {
    return (
      <>
        <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); const r = await testScale(device.configuration); setPreview(r.detail); onResult(r); setBusy(false); }}>
          {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Activity size={14} className="mr-1.5" />}Test scale (live read)
        </Button>
        {preview && <span className="text-2xs">{preview}</span>}
      </>
    );
  }
  if (device.type === "NFC_READER" && device.connectionType === "NFC_BRIDGE") {
    return (
      <>
        <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); const r = await testNfc(); setPreview(r.detail); onResult(r); setBusy(false); }}>
          {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <CreditCard size={14} className="mr-1.5" />}Test read (tap a card)
        </Button>
        {preview && <span className="text-2xs">{preview}</span>}
      </>
    );
  }
  return null;
}

async function testScale(config: Record<string, unknown>): Promise<LiveResult> {
  const serial = typeof navigator !== "undefined" ? (navigator as unknown as { serial?: { requestPort: () => Promise<any> } }).serial : undefined;
  if (!serial) return { method: "WEB_SERIAL_READ", passed: false, detail: "This browser has no Web Serial support (use Chrome or Edge on the weighbridge PC)." };
  const baud = Number(config.baudRate) || 9600;
  const framing = (`${config.dataBits ?? 8}-${config.parity ?? "none"}` as SerialFraming);
  let port: any;
  try {
    port = await serial.requestPort();
    await port.open(toOpenOptions({ baud, framing: ["8-none", "7-even", "7-odd"].includes(framing) ? framing : "8-none" }));
  } catch (e) {
    return { method: "WEB_SERIAL_READ", passed: false, detail: `Could not open the port: ${(e as Error).message}. Close the operator console tab if it holds the port.` };
  }
  const reader = port.readable.getReader();
  const decoder = new TextDecoder("latin1");
  let text = "";
  const deadline = Date.now() + 3000;
  try {
    while (Date.now() < deadline && text.length < 4000) {
      const chunk = await Promise.race([reader.read(), new Promise<{ value?: undefined; done: true }>((r) => setTimeout(() => r({ done: true }), Math.max(50, deadline - Date.now())))]);
      if (chunk.value) text += decoder.decode(chunk.value, { stream: true });
      if (chunk.done && Date.now() >= deadline) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    await port.close().catch(() => undefined);
  }
  const frames = text.split(/\r\n|\r|\n/).filter((f) => f.trim());
  const parsed = frames.map(parseMettlerWeight).filter((w): w is { weightKg: number; isStable: boolean } => w !== null);
  const last = parsed[parsed.length - 1];
  const raw = (frames[frames.length - 1] ?? text.slice(-60)).replace(/[^\x20-\x7e]/g, "·").slice(0, 120);
  if (!text) return { method: "WEB_SERIAL_READ", passed: false, detail: `No data in 3 s at ${baud} baud. Check the cable and that the indicator is in continuous output mode.` };
  if (!last) return { method: "WEB_SERIAL_READ", passed: false, detail: `Data received but no weight could be parsed. Check baud/parity and protocol.`, rawSample: raw };
  return { method: "WEB_SERIAL_READ", passed: true, detail: `Read ${last.weightKg.toLocaleString()} kg (${last.isStable ? "stable" : "in motion"}) from ${parsed.length} frame(s).`, rawSample: raw, parsed: { weightKg: last.weightKg, stable: last.isStable, frames: parsed.length } };
}

async function testNfc(): Promise<LiveResult> {
  try {
    const { uid, kind } = await scanCard(15000);
    return { method: "NFC_BRIDGE_READ", passed: true, detail: `Card read: UID ${uid}${kind ? ` (${kind})` : ""}.`, parsed: { uid, kind: kind ?? null } };
  } catch (e) {
    return { method: "NFC_BRIDGE_READ", passed: false, detail: (e as Error).message };
  }
}
