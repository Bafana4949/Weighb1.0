"use client";
import { useState } from "react";
import { MoveHorizontal, Pencil, Plus, Power, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/providers";

type OrgOption = { id: string; name: string };
type SiteConfig = {
  operatingStart: string; operatingEnd: string; maxCapacityKg: number;
  stabilityThresholdKg: number; stabilityDurationSeconds: number; overloadTolerancePercent: string | number;
  emptyVehicleMaxKg: number; loadedVehicleMaxKg: number; positioningHoldSeconds: number;
  turnaroundThresholdMinutes: number; journeyWindowGraceMinutes: number; retentionYears: number;
  autoApprovalEnabled: boolean; requireInsuranceValid: boolean; requireDriverLicenceValid: boolean;
};
type Lane = { id: string; laneNumber: number; name: string; direction: string | null; isActive: boolean };
type SiteRow = {
  id: string; code: string; name: string; type: string; address: string;
  latitude: string | number; longitude: string | number; isActive: boolean;
  organisationId: string; organisation: OrgOption | null;
  config: SiteConfig | null; topology: string; lanes?: Lane[];
};

function selectClass() { return "h-9 w-full rounded-sm border border-border bg-surface px-3 text-sm"; }

const SITE_TYPES = ["MINE", "WEIGHBRIDGE", "DEPOT", "CUSTOMER_SITE"];
const TOPOLOGIES = [
  { value: "BIDIRECTIONAL_SINGLE", label: "Bidirectional — one weighbridge (entry + exit share one deck)" },
  { value: "DUAL_ENTRY_EXIT", label: "Dual — separate entry and exit weighbridges" },
];

export function SiteManagement({ initialSites, organisations }: { initialSites: SiteRow[]; organisations: OrgOption[] }) {
  const [sites, setSites] = useState<SiteRow[]>(initialSites);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SiteRow | null>(null);
  const [configuring, setConfiguring] = useState<SiteRow | null>(null);
  const [managingLanes, setManagingLanes] = useState<SiteRow | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function addLane(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!managingLanes) return;
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const payload = { laneNumber: Number(form.get("laneNumber")), name: form.get("name"), direction: form.get("direction") || null };
      const response = await fetch(`/api/sites/${managingLanes.id}/lanes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not add lane");
      const updatedLanes = [...(managingLanes.lanes ?? []), body.data];
      setManagingLanes((current) => current ? { ...current, lanes: updatedLanes } : current);
      setSites((current) => current.map((s) => s.id === managingLanes.id ? { ...s, lanes: updatedLanes } : s));
      formEl.reset();
    } catch (error) { toast({ title: "Could not add lane", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function removeLane(lane: Lane) {
    if (!managingLanes) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sites/${managingLanes.id}/lanes/${lane.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not remove lane");
      const updatedLanes = (managingLanes.lanes ?? []).map((l) => l.id === lane.id ? { ...l, isActive: false } : l);
      setManagingLanes((current) => current ? { ...current, lanes: updatedLanes } : current);
      setSites((current) => current.map((s) => s.id === managingLanes.id ? { ...s, lanes: updatedLanes } : s));
    } catch (error) { toast({ title: "Could not remove lane", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function saveConfig(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configuring) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const payload = {
        operatingStart: form.get("operatingStart") || undefined, operatingEnd: form.get("operatingEnd") || undefined,
        maxCapacityKg: Number(form.get("maxCapacityKg")), emptyVehicleMaxKg: Number(form.get("emptyVehicleMaxKg")),
        loadedVehicleMaxKg: Number(form.get("loadedVehicleMaxKg")), overloadTolerancePercent: Number(form.get("overloadTolerancePercent")),
        stabilityThresholdKg: Number(form.get("stabilityThresholdKg")), stabilityDurationSeconds: Number(form.get("stabilityDurationSeconds")),
        positioningHoldSeconds: Number(form.get("positioningHoldSeconds")), turnaroundThresholdMinutes: Number(form.get("turnaroundThresholdMinutes")),
        journeyWindowGraceMinutes: Number(form.get("journeyWindowGraceMinutes")), retentionYears: Number(form.get("retentionYears")),
        autoApprovalEnabled: form.get("autoApprovalEnabled") === "on", requireInsuranceValid: form.get("requireInsuranceValid") === "on",
        requireDriverLicenceValid: form.get("requireDriverLicenceValid") === "on",
      };
      const response = await fetch(`/api/sites/${configuring.id}/config`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update site configuration");
      setSites((current) => current.map((s) => s.id === configuring.id ? { ...s, config: body.data } : s));
      toast({ title: "Site configuration updated", body: configuring.name });
      setConfiguring(null);
    } catch (error) { toast({ title: "Could not update site configuration", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function createSite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const payload = {
        organisationId: form.get("organisationId"), code: form.get("code"), name: form.get("name"), type: form.get("type"),
        address: form.get("address"), latitude: Number(form.get("latitude")), longitude: Number(form.get("longitude")),
        operatingStart: form.get("operatingStart") || undefined, operatingEnd: form.get("operatingEnd") || undefined,
        topology: form.get("topology") || undefined,
      };
      const response = await fetch("/api/sites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not add site");
      setSites((current) => [body.data, ...current]);
      toast({ title: "Site added", body: body.data.name });
      formEl.reset();
      setCreateOpen(false);
    } catch (error) { toast({ title: "Could not add site", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const payload = {
        name: form.get("name"), type: form.get("type"), address: form.get("address"),
        latitude: Number(form.get("latitude")), longitude: Number(form.get("longitude")),
        operatingStart: form.get("operatingStart") || undefined, operatingEnd: form.get("operatingEnd") || undefined,
        topology: form.get("topology") || undefined,
      };
      const response = await fetch(`/api/sites/${editing.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update site");
      setSites((current) => current.map((s) => s.id === editing.id ? body.data : s));
      toast({ title: "Site updated", body: body.data.name });
      setEditing(null);
    } catch (error) { toast({ title: "Could not update site", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function deactivate(site: SiteRow) {
    if (!window.confirm(`Deactivate ${site.name}? It will no longer be selectable for new orders or bookings.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not deactivate site");
      setSites((current) => current.map((s) => s.id === site.id ? { ...s, isActive: false } : s));
      toast({ title: "Site deactivated", body: site.name });
    } catch (error) { toast({ title: "Could not deactivate site", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle>Sites</CardTitle>
      <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} className="mr-1.5" />New site</Button>
    </CardHeader>
    <CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Location</TableHead><TableHead>Operating hours</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
        <TableBody>{sites.length ? sites.map((s) => <TableRow key={s.id}>
          <TableCell className="font-mono">{s.code}</TableCell>
          <TableCell>{s.name}<p className="text-2xs text-muted-foreground">{s.organisation?.name ?? "—"}</p></TableCell>
          <TableCell><Badge variant="default">{s.type}</Badge></TableCell>
          <TableCell className="text-xs">{s.address}</TableCell>
          <TableCell className="font-mono text-xs">{s.config ? `${s.config.operatingStart} – ${s.config.operatingEnd}` : "—"}</TableCell>
          <TableCell><Badge variant={s.isActive ? "default" : "destructive"}>{s.isActive ? "ACTIVE" : "INACTIVE"}</Badge></TableCell>
          <TableCell><div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setEditing(s)} disabled={busy}><Pencil size={13} className="mr-1" />Edit</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfiguring(s)} disabled={busy}><Settings2 size={13} className="mr-1" />Configure</Button>
            {s.topology === "DUAL_ENTRY_EXIT" && <Button variant="ghost" size="sm" onClick={() => setManagingLanes(s)} disabled={busy}><MoveHorizontal size={13} className="mr-1" />Lanes</Button>}
            <Button variant="ghost" size="sm" onClick={() => deactivate(s)} disabled={busy || !s.isActive}><Power size={13} className="mr-1" />Deactivate</Button>
          </div></TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={7} className="p-8 text-center text-sm text-muted-foreground">No sites registered yet</TableCell></TableRow>}</TableBody>
      </Table>
    </CardContent>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>New site</DialogTitle></DialogHeader>
        <form onSubmit={createSite} className="grid gap-3 md:grid-cols-2">
          {organisations.length > 1
            ? <div className="space-y-1.5 md:col-span-2"><Label htmlFor="s-org">Owning organisation</Label><select id="s-org" name="organisationId" required className={selectClass()} defaultValue="">{organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
            : <input type="hidden" name="organisationId" value={organisations[0]?.id ?? ""} />}
          <div className="space-y-1.5"><Label htmlFor="s-code">Site code</Label><Input id="s-code" name="code" required minLength={2} placeholder="MIN-01" /></div>
          <div className="space-y-1.5"><Label htmlFor="s-type">Type</Label><select id="s-type" name="type" required className={selectClass()} defaultValue="MINE">{SITE_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="s-name">Name</Label><Input id="s-name" name="name" required minLength={2} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="s-address">Location / address</Label><Input id="s-address" name="address" required minLength={2} /></div>
          <div className="space-y-1.5"><Label htmlFor="s-lat">Latitude</Label><Input id="s-lat" name="latitude" type="number" step="0.0000001" required min={-90} max={90} /></div>
          <div className="space-y-1.5"><Label htmlFor="s-lng">Longitude</Label><Input id="s-lng" name="longitude" type="number" step="0.0000001" required min={-180} max={180} /></div>
          <div className="space-y-1.5"><Label htmlFor="s-start">Operating hours start</Label><Input id="s-start" name="operatingStart" type="time" defaultValue="05:00" /></div>
          <div className="space-y-1.5"><Label htmlFor="s-end">Operating hours end</Label><Input id="s-end" name="operatingEnd" type="time" defaultValue="22:00" /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="s-topology">Weighbridge topology</Label><select id="s-topology" name="topology" className={selectClass()} defaultValue="BIDIRECTIONAL_SINGLE">{TOPOLOGIES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          <div className="md:col-span-2"><Button type="submit" disabled={busy} className="w-full">{busy ? "Adding…" : "Add site"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {editing?.name}</DialogTitle></DialogHeader>
        {editing && <form onSubmit={saveEdit} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="es-type">Type</Label><select id="es-type" name="type" required className={selectClass()} defaultValue={editing.type}>{SITE_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="es-name">Name</Label><Input id="es-name" name="name" required minLength={2} defaultValue={editing.name} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="es-address">Location / address</Label><Input id="es-address" name="address" required minLength={2} defaultValue={editing.address} /></div>
          <div className="space-y-1.5"><Label htmlFor="es-lat">Latitude</Label><Input id="es-lat" name="latitude" type="number" step="0.0000001" required min={-90} max={90} defaultValue={String(editing.latitude)} /></div>
          <div className="space-y-1.5"><Label htmlFor="es-lng">Longitude</Label><Input id="es-lng" name="longitude" type="number" step="0.0000001" required min={-180} max={180} defaultValue={String(editing.longitude)} /></div>
          <div className="space-y-1.5"><Label htmlFor="es-start">Operating hours start</Label><Input id="es-start" name="operatingStart" type="time" defaultValue={editing.config?.operatingStart ?? "05:00"} /></div>
          <div className="space-y-1.5"><Label htmlFor="es-end">Operating hours end</Label><Input id="es-end" name="operatingEnd" type="time" defaultValue={editing.config?.operatingEnd ?? "22:00"} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="es-topology">Weighbridge topology</Label><select id="es-topology" name="topology" className={selectClass()} defaultValue={editing.topology}>{TOPOLOGIES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          <div className="md:col-span-2"><Button type="submit" disabled={busy} className="w-full">{busy ? "Saving…" : "Save changes"}</Button></div>
        </form>}
      </DialogContent>
    </Dialog>

    <Dialog open={configuring !== null} onOpenChange={(open) => { if (!open) setConfiguring(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Configure {configuring?.name}</DialogTitle></DialogHeader>
        {configuring && <form onSubmit={saveConfig} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="cf-start">Operating hours start</Label><Input id="cf-start" name="operatingStart" type="time" defaultValue={configuring.config?.operatingStart ?? "05:00"} /></div>
          <div className="space-y-1.5"><Label htmlFor="cf-end">Operating hours end</Label><Input id="cf-end" name="operatingEnd" type="time" defaultValue={configuring.config?.operatingEnd ?? "22:00"} /></div>
          <div className="space-y-1.5"><Label htmlFor="cf-capacity">Bridge capacity (kg)</Label><Input id="cf-capacity" name="maxCapacityKg" type="number" min={1000} max={200000} required defaultValue={configuring.config?.maxCapacityKg ?? 80000} /></div>
          <div className="space-y-1.5"><Label htmlFor="cf-empty">Empty vehicle max (kg)</Label><Input id="cf-empty" name="emptyVehicleMaxKg" type="number" min={1000} max={50000} required defaultValue={configuring.config?.emptyVehicleMaxKg ?? 18500} /></div>
          <div className="space-y-1.5"><Label htmlFor="cf-loaded">Loaded vehicle max (kg)</Label><Input id="cf-loaded" name="loadedVehicleMaxKg" type="number" min={10000} max={150000} required defaultValue={configuring.config?.loadedVehicleMaxKg ?? 70000} /></div>
          <div className="space-y-1.5"><Label htmlFor="cf-tolerance">Overload tolerance (%)</Label><Input id="cf-tolerance" name="overloadTolerancePercent" type="number" step="0.1" min={0} max={25} required defaultValue={configuring.config ? Number(configuring.config.overloadTolerancePercent) : 5} /></div>
          <div className="space-y-1.5"><Label htmlFor="cf-stab-kg">Stability threshold (kg)</Label><Input id="cf-stab-kg" name="stabilityThresholdKg" type="number" min={1} max={1000} required defaultValue={configuring.config?.stabilityThresholdKg ?? 20} /></div>
          <div className="space-y-1.5"><Label htmlFor="cf-stab-sec">Stability duration (sec)</Label><Input id="cf-stab-sec" name="stabilityDurationSeconds" type="number" min={1} max={30} required defaultValue={configuring.config?.stabilityDurationSeconds ?? 3} /></div>
          <div className="space-y-1.5"><Label htmlFor="cf-pos">Positioning hold (sec)</Label><Input id="cf-pos" name="positioningHoldSeconds" type="number" min={1} max={20} required defaultValue={configuring.config?.positioningHoldSeconds ?? 2} /></div>
          <div className="space-y-1.5"><Label htmlFor="cf-turnaround">Turnaround alert (min)</Label><Input id="cf-turnaround" name="turnaroundThresholdMinutes" type="number" min={5} max={1440} required defaultValue={configuring.config?.turnaroundThresholdMinutes ?? 45} /></div>
          <div className="space-y-1.5"><Label htmlFor="cf-grace">Booking window grace (min)</Label><Input id="cf-grace" name="journeyWindowGraceMinutes" type="number" min={0} max={1440} required defaultValue={configuring.config?.journeyWindowGraceMinutes ?? 120} /></div>
          <div className="space-y-1.5"><Label htmlFor="cf-retention">Record retention (years)</Label><Input id="cf-retention" name="retentionYears" type="number" min={1} max={10} required defaultValue={configuring.config?.retentionYears ?? 5} /></div>
          <div className="space-y-2 md:col-span-2 rounded-sm border border-border p-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autoApprovalEnabled" defaultChecked={configuring.config?.autoApprovalEnabled ?? true} />Auto-approve bookings that pass every policy check</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requireInsuranceValid" defaultChecked={configuring.config?.requireInsuranceValid ?? true} />Require valid vehicle insurance to book</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requireDriverLicenceValid" defaultChecked={configuring.config?.requireDriverLicenceValid ?? true} />Require valid driver licence to book</label>
          </div>
          <div className="md:col-span-2"><Button type="submit" disabled={busy} className="w-full">{busy ? "Saving…" : "Save configuration"}</Button></div>
        </form>}
      </DialogContent>
    </Dialog>

    <Dialog open={managingLanes !== null} onOpenChange={(open) => { if (!open) setManagingLanes(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Lanes at {managingLanes?.name}</DialogTitle></DialogHeader>
        {managingLanes && <div className="space-y-3">
          <p className="text-2xs text-muted-foreground">This site uses dual entry/exit weighbridges — each physical scale is its own lane with its own hardware.</p>
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Name</TableHead><TableHead>Direction</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>{(managingLanes.lanes ?? []).length ? (managingLanes.lanes ?? []).map((l) => <TableRow key={l.id}>
              <TableCell className="font-mono text-xs">{l.laneNumber}</TableCell>
              <TableCell className="text-xs">{l.name}</TableCell>
              <TableCell className="text-xs">{l.direction ?? "—"}</TableCell>
              <TableCell><Badge variant={l.isActive ? "default" : "destructive"}>{l.isActive ? "ACTIVE" : "INACTIVE"}</Badge></TableCell>
              <TableCell><Button variant="ghost" size="sm" onClick={() => removeLane(l)} disabled={busy || !l.isActive}><Power size={13} /></Button></TableCell>
            </TableRow>) : <TableRow><TableCell colSpan={5} className="p-4 text-center text-xs text-muted-foreground">No lanes configured yet</TableCell></TableRow>}</TableBody>
          </Table>
          <form onSubmit={addLane} className="grid grid-cols-4 gap-2 items-end border-t border-border pt-3">
            <div className="space-y-1.5"><Label htmlFor="l-num">#</Label><Input id="l-num" name="laneNumber" type="number" min={1} max={20} required /></div>
            <div className="space-y-1.5"><Label htmlFor="l-name">Name</Label><Input id="l-name" name="name" required minLength={1} placeholder="North gate" /></div>
            <div className="space-y-1.5"><Label htmlFor="l-dir">Direction</Label><select id="l-dir" name="direction" className={selectClass()} defaultValue=""><option value="">—</option><option value="ENTRY">ENTRY</option><option value="EXIT">EXIT</option></select></div>
            <Button type="submit" disabled={busy} size="sm"><Plus size={13} className="mr-1" />Add</Button>
          </form>
        </div>}
      </DialogContent>
    </Dialog>
  </Card>;
}
