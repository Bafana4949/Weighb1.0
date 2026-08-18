"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/providers";

type Choice = { id: string; label: string };
type DriverChoice = { id: string; label: string; blocked: boolean; blockedReason: string | null };
type OrderChoice = { id: string; label: string; siteId: string; product: string; estimatedMassKg: number };
type TrailerChoice = { id: string; label: string; vehicleId: string | null };
export function BookingForm({ vehicles, drivers, sites, orders, trailers }: { vehicles: Choice[]; drivers: DriverChoice[]; sites: Choice[]; orders: OrderChoice[]; trailers: TrailerChoice[] }) {
  const [busy,setBusy]=useState(false); const toast=useToast();
  const [orderId,setOrderId]=useState("");
  const [siteId,setSiteId]=useState("");
  const [commodity,setCommodity]=useState("IRON_ORE");
  const [targetTonnageKg,setTargetTonnageKg]=useState("36000");
  const [vehicleId,setVehicleId]=useState("");
  const [trailerId,setTrailerId]=useState("");
  const [additionalTrailerIds,setAdditionalTrailerIds]=useState<string[]>([]);
  const vehicleTrailers = useMemo(() => trailers.filter((t) => t.vehicleId === vehicleId), [trailers, vehicleId]);
  function selectOrder(id:string){
    setOrderId(id);
    const order=orders.find((o)=>o.id===id);
    if(order){
      setSiteId(order.siteId);
      setCommodity(order.product);
      setTargetTonnageKg(order.estimatedMassKg.toString());
    }
  }
  function selectVehicle(id:string){ setVehicleId(id); setTrailerId(""); setAdditionalTrailerIds([]); }
  function toggleAdditionalTrailer(id:string){ setAdditionalTrailerIds((current)=>current.includes(id)?current.filter((x)=>x!==id):[...current,id]); }
  async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const formEl=event.currentTarget;const form=new FormData(formEl);
    const selectedDriver=drivers.find((d)=>d.id===form.get("driverId"));
    if(selectedDriver?.blocked){toast({title:"Cannot book this driver",body:selectedDriver.blockedReason??"This driver cannot be booked right now.",severity:"HIGH"});return;}
    setBusy(true);
    // <input type="datetime-local"> yields a timezone-naive string ("2026-07-23T11:17").
    // `new Date(...)` on that string is interpreted in *this browser's* local timezone,
    // so converting to an ISO string here (client-side) captures the instant the user
    // actually meant. Sending the naive string as-is would instead be re-interpreted by
    // the server in *its* timezone (UTC in this deployment), silently shifting the
    // window by the visitor's UTC offset.
    const windowStart=new Date(String(form.get("windowStart"))).toISOString();
    const windowEnd=new Date(String(form.get("windowEnd"))).toISOString();
    const payload={vehicleId:form.get("vehicleId"),driverId:form.get("driverId"),siteId:form.get("siteId"),orderId:orderId||undefined,trailerId:trailerId||undefined,additionalTrailerIds,commodity:form.get("commodity"),targetTonnageKg:Number(form.get("targetTonnageKg")),windowStart,windowEnd};try{const response=await fetch("/api/bookings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const body=await response.json();if(!response.ok)throw new Error(body.error);toast({title:"Booking created",body:`${body.data.reference} · ${body.data.status}`});if(body.data.warnings?.length)toast({title:"Note",body:body.data.warnings.join(" "),severity:"MEDIUM"});formEl.reset();window.location.reload();}catch(error){toast({title:"Booking failed",body:String(error),severity:"HIGH"});}finally{setBusy(false)}}
  return <form onSubmit={submit} className="grid gap-3 md:grid-cols-2"><Field label="Weighbridge order (optional)"><select name="orderId" value={orderId} onChange={(e)=>selectOrder(e.target.value)} className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"><option value="">— No order —</option>{orders.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></Field><div/><Field label="Vehicle"><select name="vehicleId" value={vehicleId} onChange={(e)=>selectVehicle(e.target.value)} required className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"><option value="" disabled>Select a vehicle</option>{vehicles.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></Field><Field label="Driver"><select name="driverId" required className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm">{drivers.map(x=><option key={x.id} value={x.id}>{x.label}{x.blocked?" — CANNOT BOOK":""}</option>)}</select></Field>{vehicleTrailers.length>0&&<><Field label="Primary trailer (optional)"><select value={trailerId} onChange={(e)=>setTrailerId(e.target.value)} className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"><option value="">— None —</option>{vehicleTrailers.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></Field><Field label="Additional trailers (optional)"><div className="flex flex-wrap gap-3 pt-1.5">{vehicleTrailers.filter((t)=>t.id!==trailerId).map((t)=><label key={t.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={additionalTrailerIds.includes(t.id)} onChange={()=>toggleAdditionalTrailer(t.id)} />{t.label}</label>)}</div></Field></>}<Field label="Destination site">{orderId && <input type="hidden" name="siteId" value={siteId} />}<select name={orderId ? undefined : "siteId"} value={siteId} onChange={(e)=>setSiteId(e.target.value)} required disabled={!!orderId} className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm disabled:opacity-50"><option value="" disabled>Select a site</option>{sites.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></Field><Field label="Commodity"><Input name="commodity" value={commodity} onChange={(e)=>setCommodity(e.target.value)} required readOnly={!!orderId} className="read-only:opacity-75" /></Field><Field label="Target load (kg)"><Input name="targetTonnageKg" type="number" min="1000" max="80000" step="20" value={targetTonnageKg} onChange={(e)=>setTargetTonnageKg(e.target.value)} required readOnly={!!orderId} className="read-only:opacity-75" /></Field><div/><Field label="Arrival window start"><Input name="windowStart" type="datetime-local" required /></Field><Field label="Arrival window end"><Input name="windowEnd" type="datetime-local" required /></Field><div className="md:col-span-2"><Button disabled={busy}>{busy?"Submitting…":"Create pre-authorisation"}</Button></div></form>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>}
