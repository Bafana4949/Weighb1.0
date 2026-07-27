"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, RotateCcw, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/providers";
import { formatKg } from "@/lib/utils";

type PendingDecision = { gross_weight_kg: number; net_weight_kg: number | null; captured_at: string } | null;

export function DriverKiosk({ siteCode }: { siteCode: string }) {
  const [state, setState] = useState("IDLE");
  const [pending, setPending] = useState<PendingDecision>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch("/api/edge/live", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (body.data?.state) setState(body.data.state);
        setPending(body.data?.pending_driver_decision ?? null);
      } catch { /* keep showing the last known state on transient errors */ }
    }, 1_500);
    return () => clearInterval(timer);
  }, []);

  async function decide(decision: "ACCEPT" | "RELOAD") {
    setBusy(true);
    try {
      const response = await fetch("/api/edge/driver-decision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not record driver decision");
      toast({ title: decision === "ACCEPT" ? "Load accepted" : "Reload requested", body: decision === "ACCEPT" ? "Exit gate released." : "Truck returning to the loading area." });
      setPending(null);
    } catch (error) { toast({ title: "Could not record driver decision", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  if (!pending) {
    return <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <Truck size={48} className="text-muted-foreground" />
      <div>
        <p className="text-xl font-semibold text-foreground">Waiting for a truck</p>
        <p className="mt-1 text-sm text-muted-foreground">{siteCode} · state {state}</p>
      </div>
    </div>;
  }

  return <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8 text-center">
    <div>
      <Badge variant="warning">Check your load</Badge>
      <p className="mt-4 font-mono text-6xl font-bold text-foreground">{formatKg(pending.gross_weight_kg)}</p>
      {pending.net_weight_kg !== null && <p className="mt-2 text-sm text-muted-foreground">Net load: {formatKg(pending.net_weight_kg)}</p>}
      <p className="mt-3 max-w-md text-sm text-muted-foreground">If this looks right, accept and exit. If you're not happy with the load, send the truck back to reload.</p>
    </div>
    <div className="grid w-full max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
      <Button size="lg" className="h-16 text-lg" disabled={busy} onClick={() => decide("ACCEPT")}><CheckCircle2 size={22} className="mr-2" />Accept &amp; exit</Button>
      <Button size="lg" variant="destructive" className="h-16 text-lg" disabled={busy} onClick={() => decide("RELOAD")}><RotateCcw size={22} className="mr-2" />Reload</Button>
    </div>
  </div>;
}
