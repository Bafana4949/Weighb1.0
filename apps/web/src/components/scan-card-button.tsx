"use client";

import { useState } from "react";
import { Nfc, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers";
import { scanCard, normalizeUid, ScannerError } from "@/lib/card-scanner";

/**
 * "Scan card" button that fills a target text input with a UID read from the
 * USB NFC reader (via the local nfc-bridge). Writes to an uncontrolled input
 * by id, so it works with the existing FormData-based forms. Manual typing
 * into the field keeps working regardless.
 */
export function ScanCardButton({
  targetId,
  size = "sm",
  className,
  onScanned,
}: {
  targetId: string;
  size?: "sm" | "default" | "icon";
  className?: string;
  onScanned?: (uid: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function handleScan() {
    setBusy(true);
    try {
      const { uid, kind } = await scanCard();
      const input = document.getElementById(targetId) as HTMLInputElement | null;
      if (input) {
        input.value = normalizeUid(uid);
        // let any listeners / validators notice the change
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
      }
      onScanned?.(uid);
      toast({ title: "Card scanned", body: `${uid}${kind ? ` (${kind})` : ""}` });
    } catch (error) {
      const message = error instanceof ScannerError ? error.message : String(error);
      const severity = error instanceof ScannerError && error.kind === "nocard" ? "MEDIUM" : "HIGH";
      toast({ title: "Scan failed", body: message, severity });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size={size} className={className} onClick={handleScan} disabled={busy}>
      {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Nfc size={14} className="mr-1.5" />}
      {busy ? "Tap card…" : "Scan card"}
    </Button>
  );
}
