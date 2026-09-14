"use client";
import { useState } from "react";
import { Eye, MoveHorizontal, Pencil, Plus, Power, Settings2, Building2, MapPin, Clock, Scale } from "lucide-react";
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
  operatingStart: string;
  operatingEnd: string;
  maxCapacityKg: number;
  stabilityThresholdKg: number;
  stabilityDurationSeconds: number;
  overloadTolerancePercent: string | number;
  emptyVehicleMaxKg: number;
  loadedVehicleMaxKg: number;
  positioningHoldSeconds: number;
  turnaroundThresholdMinutes: number;
  journeyWindowGraceMinutes: number;
  retentionYears: number;
  autoApprovalEnabled: boolean;
  requireInsuranceValid: boolean;
  requireDriverLicenceValid: boolean;
};
type Lane = { id: string; laneNumber: number; name: string; direction: string | null; isActive: boolean };
type SiteRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  address: string;
  latitude: string | number;
  longitude: string | number;
  isActive: boolean;
  organisationId: string;
  organisation: OrgOption | null;
  config: SiteConfig | null;
  topology: string;
  lanes?: Lane[];
};

function selectClass() {
  return "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary";
}

const SITE_TYPES = ["MINE", "WEIGHBRIDGE", "DEPOT", "CUSTOMER_SITE"];
const TOPOLOGIES = [
  { value: "BIDIRECTIONAL_SINGLE", label: "Bidirectional — one weighbridge (entry + exit share one deck)" },
  { value: "DUAL_ENTRY_EXIT", label: "Dual — separate entry and exit weighbridges" },
];

export function SiteManagement({
  initialSites,
  organisations,
  isSuperAdmin = false,
}: {
  initialSites: SiteRow[];
  organisations: OrgOption[];
  isSuperAdmin?: boolean;
}) {
  const [sites, setSites] = useState<SiteRow[]>(initialSites);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SiteRow | null>(null);
  const [configuring, setConfiguring] = useState<SiteRow | null>(null);
  const [managingLanes, setManagingLanes] = useState<SiteRow | null>(null);
  const [viewingDetails, setViewingDetails] = useState<SiteRow | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function addLane(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!managingLanes) return;
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const payload = {
        laneNumber: Number(form.get("laneNumber")),
        name: form.get("name"),
        direction: form.get("direction") || null,
      };
      const response = await fetch(`/api/sites/${managingLanes.id}/lanes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not add lane");
      const updatedLanes = [...(managingLanes.lanes ?? []), body.data];
      setManagingLanes((current) => (current ? { ...current, lanes: updatedLanes } : current));
      setSites((current) => current.map((s) => (s.id === managingLanes.id ? { ...s, lanes: updatedLanes } : s)));
      formEl.reset();
    } catch (error) {
      toast({ title: "Could not add lane", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  async function removeLane(lane: Lane) {
    if (!managingLanes) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sites/${managingLanes.id}/lanes/${lane.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not remove lane");
      const updatedLanes = (managingLanes.lanes ?? []).map((l) => (l.id === lane.id ? { ...l, isActive: false } : l));
      setManagingLanes((current) => (current ? { ...current, lanes: updatedLanes } : current));
      setSites((current) => current.map((s) => (s.id === managingLanes.id ? { ...s, lanes: updatedLanes } : s)));
    } catch (error) {
      toast({ title: "Could not remove lane", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configuring) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const payload = {
        operatingStart: form.get("operatingStart") || undefined,
        operatingEnd: form.get("operatingEnd") || undefined,
        maxCapacityKg: Number(form.get("maxCapacityKg")),
        emptyVehicleMaxKg: Number(form.get("emptyVehicleMaxKg")),
        loadedVehicleMaxKg: Number(form.get("loadedVehicleMaxKg")),
        overloadTolerancePercent: Number(form.get("overloadTolerancePercent")),
        stabilityThresholdKg: Number(form.get("stabilityThresholdKg")),
        stabilityDurationSeconds: Number(form.get("stabilityDurationSeconds")),
        positioningHoldSeconds: Number(form.get("positioningHoldSeconds")),
        turnaroundThresholdMinutes: Number(form.get("turnaroundThresholdMinutes")),
        journeyWindowGraceMinutes: Number(form.get("journeyWindowGraceMinutes")),
        retentionYears: Number(form.get("retentionYears")),
        autoApprovalEnabled: form.get("autoApprovalEnabled") === "on",
        requireInsuranceValid: form.get("requireInsuranceValid") === "on",
        requireDriverLicenceValid: form.get("requireDriverLicenceValid") === "on",
      };
      const response = await fetch(`/api/sites/${configuring.id}/config`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update site configuration");
      setSites((current) => current.map((s) => (s.id === configuring.id ? { ...s, config: body.data } : s)));
      toast({ title: "Site configuration updated", body: configuring.name });
      setConfiguring(null);
    } catch (error) {
      toast({ title: "Could not update site configuration", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  async function createSite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const payload = {
        organisationId: form.get("organisationId"),
        code: form.get("code"),
        name: form.get("name"),
        type: form.get("type"),
        address: form.get("address"),
        latitude: Number(form.get("latitude")),
        longitude: Number(form.get("longitude")),
        operatingStart: form.get("operatingStart") || undefined,
        operatingEnd: form.get("operatingEnd") || undefined,
        topology: form.get("topology") || undefined,
      };
      const response = await fetch("/api/sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not add site");
      setSites((current) => [body.data, ...current]);
      toast({ title: "Site added", body: body.data.name });
      formEl.reset();
      setCreateOpen(false);
    } catch (error) {
      toast({ title: "Could not add site", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const payload = {
        name: form.get("name"),
        type: form.get("type"),
        address: form.get("address"),
        latitude: Number(form.get("latitude")),
        longitude: Number(form.get("longitude")),
        operatingStart: form.get("operatingStart") || undefined,
        operatingEnd: form.get("operatingEnd") || undefined,
        topology: form.get("topology") || undefined,
      };
      const response = await fetch(`/api/sites/${editing.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update site");
      setSites((current) => current.map((s) => (s.id === editing.id ? body.data : s)));
      toast({ title: "Site updated", body: body.data.name });
      setEditing(null);
    } catch (error) {
      toast({ title: "Could not update site", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(site: SiteRow) {
    if (!window.confirm(`Deactivate ${site.name}? It will no longer be selectable for new orders or bookings.`))
      return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not deactivate site");
      setSites((current) => current.map((s) => (s.id === site.id ? { ...s, isActive: false } : s)));
      toast({ title: "Site deactivated", body: site.name });
    } catch (error) {
      toast({ title: "Could not deactivate site", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden border border-border">
      <CardHeader className="flex-row items-center justify-between border-b border-border bg-surface/40 py-3.5 px-4">
        <div>
          <CardTitle className="text-base font-bold">Registered Sites</CardTitle>
          <p className="text-xs text-muted-foreground">
            {isSuperAdmin
              ? "Platform-wide site provisioning and legal metrology control"
              : "Active operating sites assigned to your organization"}
          </p>
        </div>
        {isSuperAdmin && (
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5 shadow-sm">
            <Plus size={14} />
            New site
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Site Name & Client</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Operating Hours</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.length ? (
              sites.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono font-semibold">{s.code}</TableCell>
                  <TableCell>
                    <p className="font-semibold text-foreground">{s.name}</p>
                    <p className="text-2xs text-muted-foreground">{s.organisation?.name ?? "—"}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="muted" className="text-2xs font-semibold">
                      {s.type.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{s.address}</TableCell>
                  <TableCell className="font-mono text-xs text-foreground">
                    {s.config ? `${s.config.operatingStart} – ${s.config.operatingEnd}` : "05:00 – 22:00"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.isActive ? "default" : "destructive"}>
                      {s.isActive ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {isSuperAdmin ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setEditing(s)} disabled={busy}>
                            <Pencil size={13} className="mr-1" />
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfiguring(s)} disabled={busy}>
                            <Settings2 size={13} className="mr-1" />
                            Configure
                          </Button>
                          {s.topology === "DUAL_ENTRY_EXIT" && (
                            <Button variant="ghost" size="sm" onClick={() => setManagingLanes(s)} disabled={busy}>
                              <MoveHorizontal size={13} className="mr-1" />
                              Lanes
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deactivate(s)}
                            disabled={busy || !s.isActive}
                            className="text-destructive hover:text-destructive"
                          >
                            <Power size={13} className="mr-1" />
                            Deactivate
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setViewingDetails(s)}
                          className="gap-1.5 font-medium"
                        >
                          <Eye size={13} />
                          View Details
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                  No weighbridge sites assigned to your organization yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Read-Only Site Details Dialog for Client Admins */}
      <Dialog open={viewingDetails !== null} onOpenChange={(open) => { if (!open) setViewingDetails(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-primary" />
              Site Details: {viewingDetails?.name}
            </DialogTitle>
          </DialogHeader>

          {viewingDetails && (
            <div className="space-y-4 pt-2 text-sm">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface/50 p-3.5">
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">Site Code</p>
                  <p className="font-mono font-bold text-foreground mt-0.5">{viewingDetails.code}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">Site Type</p>
                  <Badge variant="muted" className="mt-0.5">{viewingDetails.type.replace("_", " ")}</Badge>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">Owning Client</p>
                  <p className="font-semibold text-foreground mt-0.5">{viewingDetails.organisation?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">Status</p>
                  <Badge variant={viewingDetails.isActive ? "default" : "destructive"} className="mt-0.5">
                    {viewingDetails.isActive ? "ACTIVE & OPERATIONAL" : "INACTIVE"}
                  </Badge>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3.5 space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  Geographical & Operating Information
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Physical Address / Gate:</p>
                    <p className="font-medium text-foreground mt-0.5">{viewingDetails.address}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Operating Hours:</p>
                    <p className="font-mono font-semibold text-foreground mt-0.5">
                      {viewingDetails.config ? `${viewingDetails.config.operatingStart} – ${viewingDetails.config.operatingEnd}` : "05:00 – 22:00"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">GPS Coordinates:</p>
                    <p className="font-mono text-muted-foreground mt-0.5">
                      {viewingDetails.latitude}, {viewingDetails.longitude}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3.5 space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Scale className="h-3.5 w-3.5 text-primary" />
                  Scale Thresholds & Metrology Specs
                </p>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="rounded border border-border p-2 bg-background">
                    <p className="text-2xs text-muted-foreground">Max Scale Capacity</p>
                    <p className="font-mono font-bold text-foreground mt-0.5">
                      {viewingDetails.config?.maxCapacityKg?.toLocaleString() ?? "80,000"} kg
                    </p>
                  </div>
                  <div className="rounded border border-border p-2 bg-background">
                    <p className="text-2xs text-muted-foreground">Loaded Vehicle Max</p>
                    <p className="font-mono font-bold text-foreground mt-0.5">
                      {viewingDetails.config?.loadedVehicleMaxKg?.toLocaleString() ?? "56,000"} kg
                    </p>
                  </div>
                  <div className="rounded border border-border p-2 bg-background">
                    <p className="text-2xs text-muted-foreground">Empty Vehicle Max</p>
                    <p className="font-mono font-bold text-foreground mt-0.5">
                      {viewingDetails.config?.emptyVehicleMaxKg?.toLocaleString() ?? "18,500"} kg
                    </p>
                  </div>
                  <div className="rounded border border-border p-2 bg-background">
                    <p className="text-2xs text-muted-foreground">Overload Tolerance</p>
                    <p className="font-mono font-bold text-foreground mt-0.5">
                      {viewingDetails.config?.overloadTolerancePercent ?? "5"}%
                    </p>
                  </div>
                  <div className="rounded border border-border p-2 bg-background">
                    <p className="text-2xs text-muted-foreground">Turnaround Alert</p>
                    <p className="font-mono font-bold text-foreground mt-0.5">
                      {viewingDetails.config?.turnaroundThresholdMinutes ?? "45"} min
                    </p>
                  </div>
                  <div className="rounded border border-border p-2 bg-background">
                    <p className="text-2xs text-muted-foreground">Data Retention</p>
                    <p className="font-mono font-bold text-foreground mt-0.5">
                      {viewingDetails.config?.retentionYears ?? "5"} years
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="secondary" onClick={() => setViewingDetails(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Super Admin Dialogs: Create, Edit, Configure, Lanes */}
      {isSuperAdmin && (
        <>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Weighbridge Site</DialogTitle>
              </DialogHeader>
              <form onSubmit={createSite} className="grid gap-3 md:grid-cols-2">
                {organisations.length > 1 ? (
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="s-org">Owning Client Organisation</Label>
                    <select id="s-org" name="organisationId" required className={selectClass()} defaultValue="">
                      {organisations.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <input type="hidden" name="organisationId" value={organisations[0]?.id ?? ""} />
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="s-code">Site Code</Label>
                  <Input id="s-code" name="code" required minLength={2} placeholder="e.g. WOESTALLEEN" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-type">Type</Label>
                  <select id="s-type" name="type" required className={selectClass()} defaultValue="MINE">
                    {SITE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="s-name">Site Name</Label>
                  <Input id="s-name" name="name" required minLength={2} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="s-address">Location / Address</Label>
                  <Input id="s-address" name="address" required minLength={2} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-lat">Latitude</Label>
                  <Input id="s-lat" name="latitude" type="number" step="0.0000001" required min={-90} max={90} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-lng">Longitude</Label>
                  <Input id="s-lng" name="longitude" type="number" step="0.0000001" required min={-180} max={180} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-start">Operating Hours Start</Label>
                  <Input id="s-start" name="operatingStart" type="time" defaultValue="05:00" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-end">Operating Hours End</Label>
                  <Input id="s-end" name="operatingEnd" type="time" defaultValue="22:00" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="s-topology">Weighbridge Topology</Label>
                  <select id="s-topology" name="topology" className={selectClass()} defaultValue="BIDIRECTIONAL_SINGLE">
                    {TOPOLOGIES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2 pt-2">
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? "Adding Site…" : "Register Site"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit {editing?.name}</DialogTitle>
              </DialogHeader>
              {editing && (
                <form onSubmit={saveEdit} className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="es-type">Type</Label>
                    <select id="es-type" name="type" required className={selectClass()} defaultValue={editing.type}>
                      {SITE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="es-name">Name</Label>
                    <Input id="es-name" name="name" required minLength={2} defaultValue={editing.name} />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="es-address">Address</Label>
                    <Input id="es-address" name="address" required minLength={2} defaultValue={editing.address} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="es-lat">Latitude</Label>
                    <Input id="es-lat" name="latitude" type="number" step="0.0000001" required min={-90} max={90} defaultValue={editing.latitude} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="es-lng">Longitude</Label>
                    <Input id="es-lng" name="longitude" type="number" step="0.0000001" required min={-180} max={180} defaultValue={editing.longitude} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="es-start">Operating Start</Label>
                    <Input id="es-start" name="operatingStart" type="time" defaultValue={editing.config?.operatingStart ?? "05:00"} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="es-end">Operating End</Label>
                    <Input id="es-end" name="operatingEnd" type="time" defaultValue={editing.config?.operatingEnd ?? "22:00"} />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="es-topology">Topology</Label>
                    <select id="es-topology" name="topology" className={selectClass()} defaultValue={editing.topology}>
                      {TOPOLOGIES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2 pt-2">
                    <Button type="submit" disabled={busy} className="w-full">
                      {busy ? "Saving…" : "Save Changes"}
                    </Button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={configuring !== null} onOpenChange={(open) => { if (!open) setConfiguring(null); }}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Configure {configuring?.name}</DialogTitle>
              </DialogHeader>
              {configuring && (
                <form onSubmit={saveConfig} className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="cf-start">Operating hours start</Label>
                    <Input id="cf-start" name="operatingStart" type="time" defaultValue={configuring.config?.operatingStart ?? "05:00"} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cf-end">Operating hours end</Label>
                    <Input id="cf-end" name="operatingEnd" type="time" defaultValue={configuring.config?.operatingEnd ?? "22:00"} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cf-capacity">Bridge capacity (kg)</Label>
                    <Input id="cf-capacity" name="maxCapacityKg" type="number" min={1000} max={200000} required defaultValue={configuring.config?.maxCapacityKg ?? 80000} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cf-empty">Empty vehicle max (kg)</Label>
                    <Input id="cf-empty" name="emptyVehicleMaxKg" type="number" min={1000} max={50000} required defaultValue={configuring.config?.emptyVehicleMaxKg ?? 18500} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cf-loaded">Loaded vehicle max (kg)</Label>
                    <Input id="cf-loaded" name="loadedVehicleMaxKg" type="number" min={10000} max={150000} required defaultValue={configuring.config?.loadedVehicleMaxKg ?? 70000} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cf-tolerance">Overload tolerance (%)</Label>
                    <Input id="cf-tolerance" name="overloadTolerancePercent" type="number" step="0.1" min={0} max={25} required defaultValue={configuring.config ? Number(configuring.config.overloadTolerancePercent) : 5} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cf-stab-kg">Stability threshold (kg)</Label>
                    <Input id="cf-stab-kg" name="stabilityThresholdKg" type="number" min={1} max={1000} required defaultValue={configuring.config?.stabilityThresholdKg ?? 20} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cf-stab-sec">Stability duration (sec)</Label>
                    <Input id="cf-stab-sec" name="stabilityDurationSeconds" type="number" min={1} max={30} required defaultValue={configuring.config?.stabilityDurationSeconds ?? 3} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cf-pos">Positioning hold (sec)</Label>
                    <Input id="cf-pos" name="positioningHoldSeconds" type="number" min={1} max={20} required defaultValue={configuring.config?.positioningHoldSeconds ?? 2} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cf-turnaround">Turnaround alert (min)</Label>
                    <Input id="cf-turnaround" name="turnaroundThresholdMinutes" type="number" min={5} max={1440} required defaultValue={configuring.config?.turnaroundThresholdMinutes ?? 45} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cf-grace">Booking window grace (min)</Label>
                    <Input id="cf-grace" name="journeyWindowGraceMinutes" type="number" min={0} max={1440} required defaultValue={configuring.config?.journeyWindowGraceMinutes ?? 120} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cf-retention">Record retention (years)</Label>
                    <Input id="cf-retention" name="retentionYears" type="number" min={1} max={10} required defaultValue={configuring.config?.retentionYears ?? 5} />
                  </div>
                  <div className="space-y-2 md:col-span-2 rounded-lg border border-border p-3 bg-surface/30">
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input type="checkbox" name="autoApprovalEnabled" defaultChecked={configuring.config?.autoApprovalEnabled ?? true} className="rounded" />
                      Auto-approve bookings that pass every policy check
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input type="checkbox" name="requireInsuranceValid" defaultChecked={configuring.config?.requireInsuranceValid ?? true} className="rounded" />
                      Require valid vehicle insurance to book
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input type="checkbox" name="requireDriverLicenceValid" defaultChecked={configuring.config?.requireDriverLicenceValid ?? true} className="rounded" />
                      Require valid driver licence to book
                    </label>
                  </div>
                  <div className="md:col-span-2 pt-2">
                    <Button type="submit" disabled={busy} className="w-full">
                      {busy ? "Saving…" : "Save Configuration"}
                    </Button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={managingLanes !== null} onOpenChange={(open) => { if (!open) setManagingLanes(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Lanes at {managingLanes?.name}</DialogTitle>
              </DialogHeader>
              {managingLanes && (
                <div className="space-y-3">
                  <p className="text-2xs text-muted-foreground">
                    This site uses dual entry/exit weighbridges — each physical scale is its own lane with its own hardware.
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(managingLanes.lanes ?? []).length ? (
                        (managingLanes.lanes ?? []).map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-mono text-xs">{l.laneNumber}</TableCell>
                            <TableCell className="text-xs font-semibold">{l.name}</TableCell>
                            <TableCell className="text-xs">{l.direction ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant={l.isActive ? "default" : "destructive"}>
                                {l.isActive ? "ACTIVE" : "INACTIVE"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => removeLane(l)} disabled={busy || !l.isActive}>
                                <Power size={13} className="text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="p-4 text-center text-xs text-muted-foreground">
                            No lanes configured yet
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <form onSubmit={addLane} className="grid grid-cols-4 gap-2 items-end border-t border-border pt-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="l-num">#</Label>
                      <Input id="l-num" name="laneNumber" type="number" min={1} max={20} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="l-name">Name</Label>
                      <Input id="l-name" name="name" required minLength={1} placeholder="North gate" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="l-dir">Direction</Label>
                      <select id="l-dir" name="direction" className={selectClass()} defaultValue="">
                        <option value="">—</option>
                        <option value="ENTRY">ENTRY</option>
                        <option value="EXIT">EXIT</option>
                      </select>
                    </div>
                    <Button type="submit" disabled={busy} size="sm">
                      <Plus size={13} className="mr-1" />
                      Add
                    </Button>
                  </form>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </Card>
  );
}
