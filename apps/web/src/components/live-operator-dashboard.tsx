"use client";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useRouter } from "next/navigation";
import { Camera, DoorOpen, Siren, TrafficCone, Truck } from "lucide-react";
import { WeightGauge } from "@/components/weight-gauge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/status-dot";
import { useToast } from "@/components/providers";
import { formatKg } from "@/lib/utils";

type Telemetry = { weight_kg: number; position_sensor_1: boolean; position_sensor_2: boolean; rfid_tag?: string | null; scale_status: string };
type QueueItem = { id: string; reference: string; plate: string; driver: string; trailer: string; transporter: string; commodity: string; status: string };
type ActiveBooking = { plate: string; reference: string; rfid: string } | null;

export function LiveOperatorDashboard({ siteCode, availableSites, initialQueue, stats }: { siteCode: string; availableSites: {code: string, name: string}[]; initialQueue: QueueItem[]; stats: { trucks: number; tonnage: number; turnaround: number; pending: number } }) {
  const [telemetry, setTelemetry] = useState<Telemetry>({ weight_kg: 0, position_sensor_1: false, position_sensor_2: false, scale_status: "UNSTABLE" });
  const [state, setState] = useState("IDLE");
  const [connected, setConnected] = useState(false);
  const [syncPending, setSyncPending] = useState(0);
  const [hardwareOnline, setHardwareOnline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeBooking, setActiveBooking] = useState<ActiveBooking>(null);
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? window.location.origin, { auth: { siteId: siteCode } });
    socket.on("connect", () => setConnected(true)); socket.on("disconnect", () => setConnected(false));
    socket.on("telemetry", (message) => { if (!message.payload.lane || message.payload.lane === "north" || message.payload.lane === "default") setTelemetry(message.payload); });
    socket.on("state", (message) => { if (!message.payload.lane || message.payload.lane === "north" || message.payload.lane === "default") setState(message.payload.state); });
    socket.on("hardware:status", (message) => setHardwareOnline(message.payload.health === "ONLINE"));
    socket.on("sync", (message) => setSyncPending(message.payload.pending_count ?? 0));
    socket.on("alerts", (message) => toast({ title: message.payload.title ?? "Site alert", body: message.payload.description, severity: message.payload.severity }));
    socket.on("transaction", (message) => toast({ title: "Transaction captured", body: `${message.payload.waybill_number} · ${formatKg(message.payload.net_weight_kg)}` }));
    return () => { socket.disconnect(); };
  }, [siteCode, toast]);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch("/api/edge/live", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (body.data?.telemetry) setTelemetry(body.data.telemetry);
        if (body.data?.state) setState(body.data.state);
        setSyncPending(body.data?.pending_sync ?? 0);
        setHardwareOnline(Boolean(body.data?.serial_connected));
        setActiveBooking(body.data?.booking ? { plate: body.data.booking.plate, reference: body.data.booking.reference, rfid: body.data.booking.driver_rfid } : null);
      } catch { /* Socket remains the primary transport. */ }
    }, 3_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/bookings/queue?site=${siteCode}`, { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (Array.isArray(body.data)) setQueue(body.data);
      } catch { /* Keep showing the last known queue on transient errors. */ }
    }, 4_000);
    return () => clearInterval(timer);
  }, [siteCode]);

  async function command(action: string, target?: string, value?: string) {
    const key = `${action}-${target ?? value}`; setBusy(key);
    try {
      const response = await fetch("/api/edge/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, target, value }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Command failed");
      toast({ title: "Hardware command sent", body: body.data.command });
    } catch (error) { toast({ title: "Command failed", body: String(error), severity: "HIGH" }); }
    finally { setBusy(null); }
  }

  const stable = telemetry.scale_status === "STABLE" && telemetry.position_sensor_1 && telemetry.position_sensor_2;
  const stateVariant = state === "FAULT" || state === "MANUAL_MODE" ? "destructive" : state === "COMPLETE" ? "default" : "warning";
  return <div className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold text-foreground">Live Weighbridge</h1><div className="mt-1 flex items-center gap-2"><select className="h-7 cursor-pointer rounded-sm border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" value={siteCode} onChange={(e) => router.push(`/operator?site=${e.target.value}`)}>{availableSites.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}</select><p className="text-xs text-muted-foreground">· 100 ms hardware telemetry</p></div></div><div className="flex items-center gap-2"><Badge variant={connected ? "default" : "destructive"}>{connected ? "Live stream" : "Polling fallback"}</Badge><Badge variant={stateVariant}>{state}</Badge></div></div>
  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[{label:"Trucks today",value:stats.trucks.toLocaleString(),unit:"vehicles"},{label:"Net tonnage",value:(stats.tonnage/1000).toFixed(1),unit:"t"},{label:"Avg turnaround",value:String(Math.round(stats.turnaround/60)),unit:"min"},{label:"Pending queue",value:String(stats.pending),unit:"items"}].map((item)=><Card key={item.label}><CardContent className="p-3"><p className="text-xs uppercase tracking-wider text-muted-foreground">{item.label}</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{item.value}<span className="ml-1 text-xs font-normal text-muted-foreground">{item.unit}</span></p></CardContent></Card>)}</div>
  <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]"><Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Scale reading</CardTitle><p className="mt-1 text-xs text-muted-foreground">Maximum certified capacity 80 000 kg</p></div><Badge variant={stable ? "default" : "muted"}>{stable ? "Capture ready" : "Waiting"}</Badge></CardHeader><CardContent><WeightGauge weight={telemetry.weight_kg} stable={stable}/><div className="grid grid-cols-2 gap-3 border-t border-border pt-3"><StatusDot active={telemetry.position_sensor_1} label="Position beam 1"/><StatusDot active={telemetry.position_sensor_2} label="Position beam 2"/><StatusDot active={hardwareOnline} label="Hardware daemon"/><StatusDot active={syncPending === 0} label={syncPending ? `${syncPending} pending sync` : "Cloud reconciled"}/></div></CardContent></Card>
  <Card><CardHeader><CardTitle>Lane camera</CardTitle></CardHeader><CardContent><div className="relative aspect-video overflow-hidden rounded-sm border border-border bg-[#0a0d13]"><div className="absolute inset-0 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.03)_0px,rgba(255,255,255,0.03)_1px,transparent_1px,transparent_26px)]" /><div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 to-transparent" />{activeBooking ? <div key={activeBooking.reference} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 anpr-detect"><div className="relative border-2 border-success px-6 py-3"><span className="absolute -left-[2px] -top-[2px] h-3 w-3 border-l-2 border-t-2 border-success" /><span className="absolute -right-[2px] -top-[2px] h-3 w-3 border-r-2 border-t-2 border-success" /><span className="absolute -left-[2px] -bottom-[2px] h-3 w-3 border-l-2 border-b-2 border-success" /><span className="absolute -right-[2px] -bottom-[2px] h-3 w-3 border-r-2 border-b-2 border-success" /><div className="text-center"><div className="font-mono text-2xl font-bold tracking-[0.15em] text-white">{activeBooking.plate}</div><div className="mt-1.5 flex items-center justify-center gap-2 text-2xs text-success"><span>{activeBooking.reference}</span><span className="text-white/25">·</span><span>RFID {activeBooking.rfid}</span></div></div></div></div> : <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-white/25"><Truck size={26} /><p className="text-xs">No vehicle at gate</p></div>}<div className="absolute bottom-2 left-2 flex items-center gap-2 rounded-sm bg-black/80 px-2 py-1 text-2xs font-mono text-white"><Camera size={12}/>{activeBooking ? "ANPR · MATCHED" : "ANPR · IDLE"}</div></div><p className="mt-2 text-2xs text-muted-foreground">Development readout: shows the plate the daemon actually matched for whichever truck is at the gate, not a live camera. Real footage requires an RTSP source wired to the site.</p><div className="mt-3 grid grid-cols-2 gap-2">
<Button variant="secondary" onClick={()=>command("GATE_OPEN","ENTRY")} disabled={busy!==null}><DoorOpen size={14} className="mr-2"/>Entry open</Button><Button variant="secondary" onClick={()=>command("GATE_OPEN","EXIT")} disabled={busy!==null}><DoorOpen size={14} className="mr-2"/>Exit open</Button><Button variant="outline" onClick={()=>command("LIGHT","ENTRY","GREEN")} disabled={busy!==null}><TrafficCone size={14} className="mr-2"/>Entry green</Button><Button variant="destructive" onClick={()=>command("BUZZER",undefined,"ON")} disabled={busy!==null}><Siren size={14} className="mr-2"/>Alarm</Button></div><p className="mt-3 text-2xs text-muted-foreground">Manual actions are audited and should only be used after identity and deck safety checks.</p></CardContent></Card></div>
  <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>Arrival queue</CardTitle><Badge variant="muted">{queue.length} vehicles</Badge></CardHeader><CardContent className="p-0"><div className="divide-y divide-border">{queue.length ? queue.map((item,index)=>{const atGate=activeBooking?.reference===item.reference;return <div key={item.id} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 px-4 py-3"><div className="flex h-7 w-7 items-center justify-center rounded-sm bg-muted font-mono text-xs text-foreground">{index+1}</div><div><p className="text-sm font-medium text-foreground">{item.plate} {item.trailer ? <span className="font-mono text-xs text-muted-foreground ml-1">+{item.trailer}</span> : null} <span className="font-normal text-muted-foreground ml-1">· {item.driver}</span></p><p className="text-xs text-muted-foreground mt-0.5">{item.reference} · {item.commodity} · <span className="font-medium">{item.transporter}</span></p></div><Badge variant={atGate?"default":"muted"}>{atGate?"At gate":item.status}</Badge></div>;}):<div className="p-8 text-center text-sm text-muted-foreground"><Truck className="mx-auto mb-2" size={22}/>No approved arrivals in the current window</div>}</div></CardContent></Card></div>;
}
