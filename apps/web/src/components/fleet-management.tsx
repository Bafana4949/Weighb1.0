"use client";
import { useRef, useState } from "react";
import { Ban, Pencil, Plus, ShieldCheck, Truck as TruckX, Upload, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaginationControls } from "@/components/pagination-controls";
import { useToast } from "@/components/providers";

type OrgOption = { id: string; name: string };
type VehicleRow = {
  id: string; plate: string; make: string; model: string; year: number | null; vin: string | null;
  tareWeightKg: number; legalMaxGvwKg: number; insuranceExpiry: string | Date; status: string;
  organisationId: string; organisation: OrgOption | null;
};
type DriverRow = {
  id: string; firstName: string; lastName: string; rfidTag: string; licenceNumber: string;
  licenceExpiry: string | Date; blacklistStatus: boolean; blacklistReason: string | null;
  organisationId: string; organisation: OrgOption | null;
};
type Pagination = { page: number; limit: number; total: number };
type TrailerRow = {
  id: string; trailerId: string; registrationNo: string | null; type: string | null; tareWeightKg: number | null;
  vehicleId: string | null; vehicle: { plate: string } | null;
};

function selectClass() { return "h-9 w-full rounded-sm border border-border bg-surface px-3 text-sm"; }
function dateInput(value: string | Date) { return new Date(value).toISOString().slice(0, 10); }

/** Minimal hand-rolled CSV parser: comma-separated, header row, double-quote escaping. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  function splitLine(line: string): string[] {
    const cells: string[] = []; let current = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (char === '"') inQuotes = false;
        else current += char;
      } else if (char === '"') inQuotes = true;
      else if (char === ",") { cells.push(current); current = ""; }
      else current += char;
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
  }
  const headers = splitLine(lines[0]!);
  return lines.slice(1).map((line) => Object.fromEntries(splitLine(line).map((value, i) => [headers[i], value])));
}

function downloadTemplate(filename: string, headers: string[]) {
  const blob = new Blob([headers.join(",") + "\n"], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function FleetManagement({ initialVehicles, initialDrivers, initialTrailers, organisations, isAdmin, vehiclePagination, driverPagination }: { initialVehicles: VehicleRow[]; initialDrivers: DriverRow[]; initialTrailers?: TrailerRow[]; organisations: OrgOption[]; isAdmin: boolean; vehiclePagination?: Pagination; driverPagination?: Pagination }) {
  return <div className="space-y-4">
    <VehicleSection initialVehicles={initialVehicles} organisations={organisations} isAdmin={isAdmin} pagination={vehiclePagination} />
    <TrailerSection initialTrailers={initialTrailers ?? []} vehicles={initialVehicles} />
    <DriverSection initialDrivers={initialDrivers} organisations={organisations} isAdmin={isAdmin} pagination={driverPagination} />
  </div>;
}

function TrailerSection({ initialTrailers, vehicles }: { initialTrailers: TrailerRow[]; vehicles: VehicleRow[] }) {
  const [trailers, setTrailers] = useState<TrailerRow[]>(initialTrailers);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function createTrailer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const payload = {
        vehicleId: form.get("vehicleId"), trailerId: form.get("trailerId"), registrationNo: form.get("registrationNo") || null,
        type: form.get("type") || null, tareWeightKg: form.get("tareWeightKg") ? Number(form.get("tareWeightKg")) : null,
      };
      const response = await fetch("/api/trailers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not add trailer");
      setTrailers((current) => [{ ...body.data, vehicle: vehicles.find((v) => v.id === body.data.vehicleId) ?? null }, ...current]);
      toast({ title: "Trailer added", body: body.data.trailerId });
      formEl.reset();
      setCreateOpen(false);
    } catch (error) { toast({ title: "Could not add trailer", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle>Trailers</CardTitle>
      <Button size="sm" onClick={() => setCreateOpen(true)} disabled={vehicles.length === 0}><Plus size={14} className="mr-1.5" />New trailer</Button>
    </CardHeader>
    <CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Trailer ID</TableHead><TableHead>Registration</TableHead><TableHead>Type</TableHead><TableHead>Tare weight</TableHead><TableHead>Vehicle</TableHead></TableRow></TableHeader>
        <TableBody>{trailers.length ? trailers.map((t) => <TableRow key={t.id}>
          <TableCell className="font-mono">{t.trailerId}</TableCell>
          <TableCell className="font-mono text-xs">{t.registrationNo ?? "—"}</TableCell>
          <TableCell className="text-xs">{t.type ?? "—"}</TableCell>
          <TableCell className="font-mono text-xs">{t.tareWeightKg ? `${t.tareWeightKg.toLocaleString()} kg` : "—"}</TableCell>
          <TableCell className="font-mono text-xs">{t.vehicle?.plate ?? "—"}</TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={5} className="p-8 text-center text-sm text-muted-foreground">No trailers registered yet</TableCell></TableRow>}</TableBody>
      </Table>
    </CardContent>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>New trailer</DialogTitle></DialogHeader>
        <form onSubmit={createTrailer} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="tr-vehicle">Vehicle</Label><select id="tr-vehicle" name="vehicleId" required className={selectClass()} defaultValue="">{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} · {v.make} {v.model}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="tr-id">Trailer ID</Label><Input id="tr-id" name="trailerId" required minLength={2} /></div>
          <div className="space-y-1.5"><Label htmlFor="tr-reg">Registration no. (optional)</Label><Input id="tr-reg" name="registrationNo" /></div>
          <div className="space-y-1.5"><Label htmlFor="tr-type">Type (optional)</Label><Input id="tr-type" name="type" placeholder="Side tipper" /></div>
          <div className="space-y-1.5"><Label htmlFor="tr-tare">Tare weight (kg, optional)</Label><Input id="tr-tare" name="tareWeightKg" type="number" min={500} max={30000} /></div>
          <div className="md:col-span-2"><Button type="submit" disabled={busy} className="w-full">{busy ? "Adding…" : "Add trailer"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </Card>;
}

function VehicleSection({ initialVehicles, organisations, isAdmin, pagination }: { initialVehicles: VehicleRow[]; organisations: OrgOption[]; isAdmin: boolean; pagination?: Pagination }) {
  const [vehicles, setVehicles] = useState<VehicleRow[]>(initialVehicles);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null);
  const [editing, setEditing] = useState<VehicleRow | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function createVehicle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const payload = {
        organisationId: form.get("organisationId") || undefined, plate: form.get("plate"), make: form.get("make"), model: form.get("model"),
        year: form.get("year") ? Number(form.get("year")) : undefined, vin: form.get("vin") || null,
        tareWeightKg: Number(form.get("tareWeightKg")), legalMaxGvwKg: Number(form.get("legalMaxGvwKg")), insuranceExpiry: form.get("insuranceExpiry"),
      };
      const response = await fetch("/api/vehicles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not add vehicle");
      setVehicles((current) => [{ ...body.data, organisation: organisations.find((o) => o.id === body.data.organisationId) ?? null }, ...current]);
      toast({ title: "Vehicle added", body: body.data.plate });
      formEl.reset();
      setCreateOpen(false);
    } catch (error) { toast({ title: "Could not add vehicle", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function importCsv(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setImportResult(null);
    try {
      const rows = parseCsv(await file.text()).map((row) => ({
        organisationId: row.organisationId || undefined, plate: row.plate, make: row.make, model: row.model,
        year: row.year ? Number(row.year) : undefined, vin: row.vin || undefined,
        tareWeightKg: Number(row.tareWeightKg), legalMaxGvwKg: Number(row.legalMaxGvwKg), insuranceExpiry: row.insuranceExpiry,
      }));
      const response = await fetch("/api/vehicles/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not import vehicles");
      setImportResult(body.data);
      if (body.data.created > 0) window.location.reload();
    } catch (error) { toast({ title: "Could not import vehicles", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const payload = {
        make: form.get("make"), model: form.get("model"), year: form.get("year") ? Number(form.get("year")) : undefined,
        vin: form.get("vin") || null, tareWeightKg: Number(form.get("tareWeightKg")), legalMaxGvwKg: Number(form.get("legalMaxGvwKg")),
        insuranceExpiry: form.get("insuranceExpiry"), status: form.get("status"),
      };
      const response = await fetch(`/api/vehicles/${editing.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update vehicle");
      setVehicles((current) => current.map((v) => v.id === editing.id ? { ...body.data, organisation: v.organisation } : v));
      toast({ title: "Vehicle updated", body: body.data.plate });
      setEditing(null);
    } catch (error) { toast({ title: "Could not update vehicle", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function deactivate(vehicle: VehicleRow) {
    if (!window.confirm(`Deactivate ${vehicle.plate}? It will no longer be selectable for new bookings.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/vehicles/${vehicle.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not deactivate vehicle");
      setVehicles((current) => current.map((v) => v.id === vehicle.id ? { ...v, status: "SUSPENDED" } : v));
      toast({ title: "Vehicle deactivated", body: vehicle.plate });
    } catch (error) { toast({ title: "Could not deactivate vehicle", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle>Vehicles</CardTitle>
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" onClick={() => { setImportResult(null); setImportOpen(true); }}><Upload size={14} className="mr-1.5" />Import CSV</Button>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} className="mr-1.5" />New vehicle</Button>
      </div>
    </CardHeader>
    <CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Plate</TableHead>{isAdmin && <TableHead>Organisation</TableHead>}<TableHead>Make / model</TableHead><TableHead>Tare / legal max</TableHead><TableHead>Insurance</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
        <TableBody>{vehicles.length ? vehicles.map((v) => <TableRow key={v.id}>
          <TableCell className="font-mono">{v.plate}</TableCell>
          {isAdmin && <TableCell>{v.organisation?.name ?? "—"}</TableCell>}
          <TableCell>{v.make} {v.model}{v.year ? ` · ${v.year}` : ""}</TableCell>
          <TableCell className="font-mono text-xs">{v.tareWeightKg.toLocaleString()} / {v.legalMaxGvwKg.toLocaleString()} kg</TableCell>
          <TableCell className="text-xs">{new Date(v.insuranceExpiry).toLocaleDateString("en-ZA")}</TableCell>
          <TableCell><Badge variant={v.status === "ACTIVE" ? "default" : v.status === "MAINTENANCE" ? "warning" : "destructive"}>{v.status}</Badge></TableCell>
          <TableCell><div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setEditing(v)} disabled={busy}><Pencil size={13} className="mr-1" />Edit</Button>
            <Button variant="ghost" size="sm" onClick={() => deactivate(v)} disabled={busy || v.status === "SUSPENDED"}><TruckX size={13} className="mr-1" />Deactivate</Button>
          </div></TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="p-8 text-center text-sm text-muted-foreground">No vehicles registered yet</TableCell></TableRow>}</TableBody>
      </Table>
    </CardContent>
    {pagination && <CardContent className="border-t border-border py-3"><PaginationControls page={pagination.page} limit={pagination.limit} total={pagination.total} basePath={isAdmin ? "/admin/fleet" : "/transporter/fleet"} pageParam="vpage" params={{}} /></CardContent>}

    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>New vehicle</DialogTitle></DialogHeader>
        <form onSubmit={createVehicle} className="grid gap-3 md:grid-cols-2">
          {isAdmin && <div className="space-y-1.5 md:col-span-2"><Label htmlFor="v-org">Organisation</Label><select id="v-org" name="organisationId" required className={selectClass()} defaultValue="">{organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>}
          <div className="space-y-1.5"><Label htmlFor="v-plate">Plate</Label><Input id="v-plate" name="plate" required minLength={5} placeholder="AB 123 CD GP" /></div>
          <div className="space-y-1.5"><Label htmlFor="v-year">Year (optional)</Label><Input id="v-year" name="year" type="number" min={1980} max={2100} /></div>
          <div className="space-y-1.5"><Label htmlFor="v-make">Make</Label><Input id="v-make" name="make" required minLength={2} /></div>
          <div className="space-y-1.5"><Label htmlFor="v-model">Model</Label><Input id="v-model" name="model" required minLength={1} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="v-vin">VIN (optional)</Label><Input id="v-vin" name="vin" /></div>
          <div className="space-y-1.5"><Label htmlFor="v-tare">Tare weight (kg)</Label><Input id="v-tare" name="tareWeightKg" type="number" required min={1000} max={50000} /></div>
          <div className="space-y-1.5"><Label htmlFor="v-gvw">Legal max GVW (kg)</Label><Input id="v-gvw" name="legalMaxGvwKg" type="number" required min={5000} max={100000} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="v-insurance">Insurance expiry</Label><Input id="v-insurance" name="insuranceExpiry" type="date" required /></div>
          <div className="md:col-span-2"><Button type="submit" disabled={busy} className="w-full">{busy ? "Adding…" : "Add vehicle"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={importOpen} onOpenChange={setImportOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Import vehicles from CSV</DialogTitle></DialogHeader>
        <form onSubmit={importCsv} className="space-y-3">
          <p className="text-xs text-muted-foreground">Columns: {isAdmin ? "organisationId, " : ""}plate, make, model, year, vin, tareWeightKg, legalMaxGvwKg, insuranceExpiry (YYYY-MM-DD).</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => downloadTemplate("vehicles-template.csv", [...(isAdmin ? ["organisationId"] : []), "plate", "make", "model", "year", "vin", "tareWeightKg", "legalMaxGvwKg", "insuranceExpiry"])}>Download CSV template</Button>
          <Input ref={fileRef} type="file" accept=".csv,text/csv" required />
          {importResult && <div className="rounded-sm border border-border p-3 text-xs">
            <p className="font-medium text-foreground">{importResult.created} vehicle{importResult.created === 1 ? "" : "s"} imported</p>
            {importResult.errors.length > 0 && <ul className="mt-2 space-y-1 text-danger">{importResult.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}</ul>}
          </div>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Importing…" : "Import"}</Button>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {editing?.plate}</DialogTitle></DialogHeader>
        {editing && <form onSubmit={saveEdit} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="ev-make">Make</Label><Input id="ev-make" name="make" required minLength={2} defaultValue={editing.make} /></div>
          <div className="space-y-1.5"><Label htmlFor="ev-model">Model</Label><Input id="ev-model" name="model" required minLength={1} defaultValue={editing.model} /></div>
          <div className="space-y-1.5"><Label htmlFor="ev-year">Year</Label><Input id="ev-year" name="year" type="number" min={1980} max={2100} defaultValue={editing.year ?? ""} /></div>
          <div className="space-y-1.5"><Label htmlFor="ev-vin">VIN</Label><Input id="ev-vin" name="vin" defaultValue={editing.vin ?? ""} /></div>
          <div className="space-y-1.5"><Label htmlFor="ev-tare">Tare weight (kg)</Label><Input id="ev-tare" name="tareWeightKg" type="number" required min={1000} max={50000} defaultValue={editing.tareWeightKg} /></div>
          <div className="space-y-1.5"><Label htmlFor="ev-gvw">Legal max GVW (kg)</Label><Input id="ev-gvw" name="legalMaxGvwKg" type="number" required min={5000} max={100000} defaultValue={editing.legalMaxGvwKg} /></div>
          <div className="space-y-1.5"><Label htmlFor="ev-insurance">Insurance expiry</Label><Input id="ev-insurance" name="insuranceExpiry" type="date" required defaultValue={dateInput(editing.insuranceExpiry)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ev-status">Status</Label><select id="ev-status" name="status" required className={selectClass()} defaultValue={editing.status}><option value="ACTIVE">ACTIVE</option><option value="SUSPENDED">SUSPENDED</option><option value="MAINTENANCE">MAINTENANCE</option><option value="EXPIRED_DOCUMENTS">EXPIRED_DOCUMENTS</option></select></div>
          <div className="md:col-span-2"><Button type="submit" disabled={busy} className="w-full">{busy ? "Saving…" : "Save changes"}</Button></div>
        </form>}
      </DialogContent>
    </Dialog>
  </Card>;
}

function DriverSection({ initialDrivers, organisations, isAdmin, pagination }: { initialDrivers: DriverRow[]; organisations: OrgOption[]; isAdmin: boolean; pagination?: Pagination }) {
  const [drivers, setDrivers] = useState<DriverRow[]>(initialDrivers);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null);
  const [editing, setEditing] = useState<DriverRow | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function createDriver(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const payload = {
        organisationId: form.get("organisationId") || undefined, firstName: form.get("firstName"), lastName: form.get("lastName"),
        idNumber: form.get("idNumber"), rfidTag: form.get("rfidTag"), licenceNumber: form.get("licenceNumber"),
        licenceExpiry: form.get("licenceExpiry"), consent: true,
      };
      const response = await fetch("/api/drivers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not add driver");
      setDrivers((current) => [{ ...body.data, organisation: organisations.find((o) => o.id === body.data.organisationId) ?? null }, ...current]);
      toast({ title: "Driver added", body: `${body.data.firstName} ${body.data.lastName}` });
      formEl.reset();
      setCreateOpen(false);
    } catch (error) { toast({ title: "Could not add driver", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function importCsv(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setImportResult(null);
    try {
      const rows = parseCsv(await file.text()).map((row) => ({
        organisationId: row.organisationId || undefined, firstName: row.firstName, lastName: row.lastName,
        idNumber: row.idNumber, rfidTag: row.rfidTag, licenceNumber: row.licenceNumber, licenceExpiry: row.licenceExpiry, consent: true,
      }));
      const response = await fetch("/api/drivers/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not import drivers");
      setImportResult(body.data);
      if (body.data.created > 0) window.location.reload();
    } catch (error) { toast({ title: "Could not import drivers", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const payload = {
        firstName: form.get("firstName"), lastName: form.get("lastName"), rfidTag: form.get("rfidTag"),
        licenceNumber: form.get("licenceNumber"), licenceExpiry: form.get("licenceExpiry"),
      };
      const response = await fetch(`/api/drivers/${editing.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update driver");
      setDrivers((current) => current.map((d) => d.id === editing.id ? { ...body.data, organisation: d.organisation } : d));
      toast({ title: "Driver updated", body: `${body.data.firstName} ${body.data.lastName}` });
      setEditing(null);
    } catch (error) { toast({ title: "Could not update driver", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function deactivate(driver: DriverRow) {
    if (!window.confirm(`Remove ${driver.firstName} ${driver.lastName} from the active fleet?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/drivers/${driver.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not remove driver");
      setDrivers((current) => current.filter((d) => d.id !== driver.id));
      toast({ title: "Driver removed", body: `${driver.firstName} ${driver.lastName}` });
    } catch (error) { toast({ title: "Could not remove driver", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function toggleBlacklist(driver: DriverRow) {
    const willBlacklist = !driver.blacklistStatus;
    const reason = willBlacklist ? window.prompt("Reason for blacklisting this driver (at least 10 characters):") : "Cleared by admin review";
    if (willBlacklist && (!reason || reason.trim().length < 10)) { toast({ title: "Blacklist cancelled", body: "A reason of at least 10 characters is required", severity: "MEDIUM" }); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/drivers/${driver.id}/blacklist`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ blacklisted: willBlacklist, reason: willBlacklist ? reason : null }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update blacklist status");
      setDrivers((current) => current.map((d) => d.id === driver.id ? { ...d, blacklistStatus: body.data.blacklistStatus, blacklistReason: body.data.blacklistReason } : d));
      toast({ title: willBlacklist ? "Driver blacklisted" : "Driver cleared", body: `${driver.firstName} ${driver.lastName}` });
    } catch (error) { toast({ title: "Could not update blacklist status", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle>Drivers</CardTitle>
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" onClick={() => { setImportResult(null); setImportOpen(true); }}><Upload size={14} className="mr-1.5" />Import CSV</Button>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} className="mr-1.5" />New driver</Button>
      </div>
    </CardHeader>
    <CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Driver</TableHead>{isAdmin && <TableHead>Organisation</TableHead>}<TableHead>RFID tag</TableHead><TableHead>Licence</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
        <TableBody>{drivers.length ? drivers.map((d) => <TableRow key={d.id}>
          <TableCell>{d.firstName} {d.lastName}</TableCell>
          {isAdmin && <TableCell>{d.organisation?.name ?? "—"}</TableCell>}
          <TableCell className="font-mono text-xs">{d.rfidTag}</TableCell>
          <TableCell><p className="font-mono text-xs">{d.licenceNumber}</p><p className="text-2xs text-muted-foreground">Expires {new Date(d.licenceExpiry).toLocaleDateString("en-ZA")}</p></TableCell>
          <TableCell>{d.blacklistStatus ? <Badge variant="destructive" title={d.blacklistReason ?? undefined}>BLACKLISTED</Badge> : new Date(d.licenceExpiry) < new Date() ? <Badge variant="destructive" title="This driver cannot be booked until their licence is renewed">LICENCE EXPIRED</Badge> : <Badge variant="default">ACTIVE</Badge>}</TableCell>
          <TableCell><div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setEditing(d)} disabled={busy}><Pencil size={13} className="mr-1" />Edit</Button>
            {isAdmin && <Button variant="ghost" size="sm" onClick={() => toggleBlacklist(d)} disabled={busy}>{d.blacklistStatus ? <ShieldCheck size={13} className="mr-1" /> : <Ban size={13} className="mr-1" />}{d.blacklistStatus ? "Clear" : "Blacklist"}</Button>}
            {!isAdmin && <Button variant="ghost" size="sm" onClick={() => deactivate(d)} disabled={busy}><Users size={13} className="mr-1" />Remove</Button>}
          </div></TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="p-8 text-center text-sm text-muted-foreground">No drivers registered yet</TableCell></TableRow>}</TableBody>
      </Table>
    </CardContent>
    {pagination && <CardContent className="border-t border-border py-3"><PaginationControls page={pagination.page} limit={pagination.limit} total={pagination.total} basePath={isAdmin ? "/admin/fleet" : "/transporter/fleet"} pageParam="dpage" params={{}} /></CardContent>}

    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>New driver</DialogTitle></DialogHeader>
        <form onSubmit={createDriver} className="grid gap-3 md:grid-cols-2">
          {isAdmin && <div className="space-y-1.5 md:col-span-2"><Label htmlFor="d-org">Organisation</Label><select id="d-org" name="organisationId" required className={selectClass()} defaultValue="">{organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>}
          <div className="space-y-1.5"><Label htmlFor="d-firstName">First name</Label><Input id="d-firstName" name="firstName" required minLength={2} /></div>
          <div className="space-y-1.5"><Label htmlFor="d-lastName">Last name</Label><Input id="d-lastName" name="lastName" required minLength={2} /></div>
          <div className="space-y-1.5"><Label htmlFor="d-idNumber">ID number</Label><Input id="d-idNumber" name="idNumber" required minLength={8} /></div>
          <div className="space-y-1.5"><Label htmlFor="d-rfid">RFID tag</Label><Input id="d-rfid" name="rfidTag" required minLength={4} /></div>
          <div className="space-y-1.5"><Label htmlFor="d-licence">Licence number</Label><Input id="d-licence" name="licenceNumber" required minLength={4} /></div>
          <div className="space-y-1.5"><Label htmlFor="d-licenceExpiry">Licence expiry</Label><Input id="d-licenceExpiry" name="licenceExpiry" type="date" required /></div>
          <p className="text-2xs text-muted-foreground md:col-span-2">By adding this driver you confirm they have consented to their ID and licence details being stored, per POPIA.</p>
          <div className="md:col-span-2"><Button type="submit" disabled={busy} className="w-full">{busy ? "Adding…" : "Add driver"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={importOpen} onOpenChange={setImportOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Import drivers from CSV</DialogTitle></DialogHeader>
        <form onSubmit={importCsv} className="space-y-3">
          <p className="text-xs text-muted-foreground">Columns: {isAdmin ? "organisationId, " : ""}firstName, lastName, idNumber, rfidTag, licenceNumber, licenceExpiry (YYYY-MM-DD).</p>
          <p className="text-2xs text-muted-foreground">By importing you confirm each driver has consented to their ID and licence details being stored, per POPIA.</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => downloadTemplate("drivers-template.csv", [...(isAdmin ? ["organisationId"] : []), "firstName", "lastName", "idNumber", "rfidTag", "licenceNumber", "licenceExpiry"])}>Download CSV template</Button>
          <Input ref={fileRef} type="file" accept=".csv,text/csv" required />
          {importResult && <div className="rounded-sm border border-border p-3 text-xs">
            <p className="font-medium text-foreground">{importResult.created} driver{importResult.created === 1 ? "" : "s"} imported</p>
            {importResult.errors.length > 0 && <ul className="mt-2 space-y-1 text-danger">{importResult.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}</ul>}
          </div>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Importing…" : "Import"}</Button>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {editing?.firstName} {editing?.lastName}</DialogTitle></DialogHeader>
        {editing && <form onSubmit={saveEdit} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="ed-firstName">First name</Label><Input id="ed-firstName" name="firstName" required minLength={2} defaultValue={editing.firstName} /></div>
          <div className="space-y-1.5"><Label htmlFor="ed-lastName">Last name</Label><Input id="ed-lastName" name="lastName" required minLength={2} defaultValue={editing.lastName} /></div>
          <div className="space-y-1.5"><Label htmlFor="ed-rfid">RFID tag</Label><Input id="ed-rfid" name="rfidTag" required minLength={4} defaultValue={editing.rfidTag} /></div>
          <div className="space-y-1.5"><Label htmlFor="ed-licence">Licence number</Label><Input id="ed-licence" name="licenceNumber" required minLength={4} defaultValue={editing.licenceNumber} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="ed-licenceExpiry">Licence expiry</Label><Input id="ed-licenceExpiry" name="licenceExpiry" type="date" required defaultValue={dateInput(editing.licenceExpiry)} /></div>
          <div className="md:col-span-2"><Button type="submit" disabled={busy} className="w-full">{busy ? "Saving…" : "Save changes"}</Button></div>
        </form>}
      </DialogContent>
    </Dialog>
  </Card>;
}
