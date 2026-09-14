"use client";
import { useState } from "react";
import { Pencil, Plus, XCircle, Truck as TruckX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/providers";

type SiteOption = { id: string; name: string };
type SourceOption = { id: string; name: string };
type DestinationOption = { id: string; name: string };
type ProductOption = { id: string; name: string };
type OrderRow = {
  id: string; orderNumber: string; type: "DISPATCH" | "RECEIPT"; status: string;
  siteId: string; site: SiteOption; 
  originSite: SiteOption | null; destinationSite: SiteOption | null;
  sourceId: string | null; destinationId: string | null; productId: string | null;
  source: SourceOption | null; destination: DestinationOption | null; productRef: ProductOption | null;
  customerName: string | null; supplierName: string | null; product: string;
  estimatedMassKg: number; stockpile: string | null;
  varianceThresholdPercent: string | number; varianceThresholdKg: number | null;
  ratePerTonZar: string | number | null; notes: string | null;
  bookings: { 
    id: string; reference: string; status: string; commodity: string; targetTonnageKg: number;
    windowStart: string | Date; windowEnd: string | Date;
    vehicle: { plate: string }; driver: { firstName: string; lastName: string; licenceNumber: string };
    transporterOrganisation: { name: string };
    transactions: { netWeightKg: number }[] 
  }[];
};

function selectClass() { return "h-9 w-full rounded-sm border border-border bg-surface px-3 text-sm"; }
function fulfilledKg(order: OrderRow) { return order.bookings.reduce((sum, b) => sum + b.transactions.reduce((s, t) => s + t.netWeightKg, 0), 0); }

export function OrderManagement({ initialOrders, sites, sources, destinations, products, organisations }: { initialOrders: OrderRow[]; sites: SiteOption[]; sources: SourceOption[]; destinations: DestinationOption[]; products: ProductOption[]; organisations?: { id: string; name: string }[] }) {
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<"DISPATCH" | "RECEIPT">("DISPATCH");
  const [editing, setEditing] = useState<OrderRow | null>(null);
  const [viewingBookings, setViewingBookings] = useState<OrderRow | null>(null);
  const [assigningOrder, setAssigningOrder] = useState<OrderRow | null>(null);
  
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [availableVehicles, setAvailableVehicles] = useState<any[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [availableTrailers, setAvailableTrailers] = useState<any[]>([]);
  const [bookingRows, setBookingRows] = useState<{ id: number; vehicleId: string; driverId: string; trailer1Id: string; trailer2Id: string }[]>([{ id: Date.now(), vehicleId: "", driverId: "", trailer1Id: "", trailer2Id: "" }]);
  
  const [busy, setBusy] = useState<string | boolean>(false);
  const toast = useToast();

  async function openAssignModal(order: OrderRow) {
    setAssigningOrder(order);
    setSelectedOrgId("");
    setAvailableVehicles([]);
    setAvailableDrivers([]);
    setAvailableTrailers([]);
    setBookingRows([{ id: Date.now(), vehicleId: "", driverId: "", trailer1Id: "", trailer2Id: "" }]);
  }

  async function fetchFleet(orgId: string) {
    setSelectedOrgId(orgId);
    if (!orgId) {
      setAvailableVehicles([]);
      setAvailableDrivers([]);
      setAvailableTrailers([]);
      return;
    }
    setBusy(true);
    try {
      const [vRes, dRes, tRes] = await Promise.all([
        fetch(`/api/vehicles?org=${orgId}`),
        fetch(`/api/drivers?org=${orgId}`),
        fetch(`/api/trailers?org=${orgId}`)
      ]);
      const [vBody, dBody, tBody] = await Promise.all([vRes.json(), dRes.json(), tRes.json()]);
      if (vRes.ok) setAvailableVehicles(vBody.data.filter((v: any) => v.status === "ACTIVE"));
      if (dRes.ok) setAvailableDrivers(dBody.data.filter((d: any) => !d.blacklistStatus && new Date(d.licenceExpiry) > new Date()));
      if (tRes.ok) setAvailableTrailers(tBody.data);
    } catch (e) {
      toast({ title: "Error fetching fleet", body: String(e), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  async function submitAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assigningOrder) return;
    
    // Filter out incomplete rows
    const validRows = bookingRows.filter(r => r.vehicleId && r.driverId);
    if (validRows.length === 0) {
      toast({ title: "No trucks assigned", severity: "HIGH" });
      return;
    }

    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const payload = {
        organisationId: selectedOrgId,
        bookings: validRows.map(r => ({
          vehicleId: r.vehicleId,
          driverId: r.driverId,
          trailer1Id: r.trailer1Id || undefined,
          trailer2Id: r.trailer2Id || undefined,
        })),
        windowStart: new Date(String(form.get("windowStart"))).toISOString(),
        windowEnd: new Date(String(form.get("windowEnd"))).toISOString(),
      };
      
      const response = await fetch(`/api/orders/${assigningOrder.id}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Assignment failed");
      
      toast({ title: "Fleet Assigned", body: `Created ${body.data.created} bookings.` });
      setAssigningOrder(null);
      window.location.reload();
    } catch (e) {
      toast({ title: "Assignment failed", body: String(e), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  async function createOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const productId = (form.get("productId") as string) || undefined;
      const selectedProduct = products.find((p) => p.id === productId);
      const payload = {
        type: form.get("type"), siteId: form.get("siteId"),
        sourceId: form.get("sourceId") || undefined, destinationId: form.get("destinationId") || undefined,
        productId,
        product: selectedProduct?.name || undefined,
        customerName: form.get("customerName") || undefined, supplierName: form.get("supplierName") || undefined,
        estimatedMassKg: Math.round(Number(form.get("estimatedMassTons")) * 1000),
        stockpile: form.get("stockpile") || undefined,
        varianceThresholdPercent: form.get("varianceThresholdPercent") ? Number(form.get("varianceThresholdPercent")) : undefined,
        varianceThresholdKg: form.get("varianceThresholdTons") ? Math.round(Number(form.get("varianceThresholdTons")) * 1000) : undefined,
        notes: form.get("notes") || undefined,
      };
      const response = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create order");
      setOrders((current) => [{ ...body.data, bookings: [] }, ...current]);
      toast({ title: "Order created", body: `${body.data.orderNumber} · ${body.data.product}` });
      formEl.reset();
      setCreateOpen(false);
    } catch (error) { toast({ title: "Could not create order", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const productId = (form.get("productId") as string) || undefined;
      const selectedProduct = products.find((p) => p.id === productId);
      const payload = {
        sourceId: form.get("sourceId") || undefined, destinationId: form.get("destinationId") || undefined,
        productId,
        product: selectedProduct?.name || undefined,
        customerName: form.get("customerName") || undefined, supplierName: form.get("supplierName") || undefined,
        estimatedMassKg: Math.round(Number(form.get("estimatedMassTons")) * 1000),
        stockpile: form.get("stockpile") || undefined,
        varianceThresholdPercent: form.get("varianceThresholdPercent") ? Number(form.get("varianceThresholdPercent")) : undefined,
        varianceThresholdKg: form.get("varianceThresholdTons") ? Math.round(Number(form.get("varianceThresholdTons")) * 1000) : undefined,
        notes: form.get("notes") || undefined,
      };
      const response = await fetch(`/api/orders/${editing.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update order");
      setOrders((current) => current.map((o) => o.id === editing.id ? { ...body.data, bookings: o.bookings } : o));
      toast({ title: "Order updated", body: `${body.data.orderNumber} · ${body.data.product}` });
      setEditing(null);
    } catch (error) { toast({ title: "Could not update order", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function cancelOrder(order: OrderRow) {
    if (!window.confirm(`Cancel order ${order.orderNumber}? Transporters will no longer be able to book against it.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/orders/${order.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not cancel order");
      setOrders((current) => current.map((o) => o.id === order.id ? { ...o, status: "CANCELLED" } : o));
      toast({ title: "Order cancelled", body: order.orderNumber });
    } catch (error) { toast({ title: "Could not cancel order", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function approveBooking(bookingId: string) {
    setBusy(bookingId);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/approve`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not approve booking");
      setOrders(current => current.map(o => ({
        ...o,
        bookings: o.bookings.map(b => b.id === bookingId ? { ...b, status: body.data.status } : b)
      })));
      if (viewingBookings) {
        setViewingBookings({
          ...viewingBookings,
          bookings: viewingBookings.bookings.map(b => b.id === bookingId ? { ...b, status: body.data.status } : b)
        });
      }
      toast({ title: "Booking approved" });
    } catch (error) { toast({ title: "Could not approve booking", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function rejectBooking(bookingId: string) {
    if (!window.confirm(`Are you sure you want to reject this booking?`)) return;
    setBusy(bookingId);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/reject`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Rejected by admin" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not reject booking");
      setOrders(current => current.map(o => ({
        ...o,
        bookings: o.bookings.filter(b => b.id !== bookingId)
      })));
      if (viewingBookings) {
        setViewingBookings({
          ...viewingBookings,
          bookings: viewingBookings.bookings.filter(b => b.id !== bookingId)
        });
      }
      toast({ title: "Booking rejected" });
    } catch (error) { toast({ title: "Could not reject booking", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle>Manage Weighbridge Order</CardTitle>
      <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} className="mr-1.5" />New order</Button>
    </CardHeader>
    <CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Type</TableHead><TableHead>Weighbridge</TableHead><TableHead>Route</TableHead><TableHead>Customer / Supplier</TableHead><TableHead>Product</TableHead><TableHead>Progress</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
        <TableBody>{orders.length ? orders.map((o) => <TableRow key={o.id}>
          <TableCell className="font-mono">{o.orderNumber}</TableCell>
          <TableCell><Badge variant={o.type === "DISPATCH" ? "default" : "warning"}>{o.type}</Badge></TableCell>
          <TableCell className="text-xs">{o.site.name}</TableCell>
          <TableCell className="text-xs">{o.source?.name ?? o.originSite?.name ?? "—"} → {o.destination?.name ?? o.destinationSite?.name ?? "—"}</TableCell>
          <TableCell className="text-xs">{o.customerName ?? o.supplierName ?? "—"}</TableCell>
          <TableCell>{o.productRef?.name ?? o.product}{o.stockpile ? <p className="text-2xs text-muted-foreground">Stockpile {o.stockpile}</p> : null}</TableCell>
          <TableCell className="font-mono text-xs">{(fulfilledKg(o) / 1000).toFixed(1)} / {(o.estimatedMassKg / 1000).toFixed(1)} t</TableCell>
          <TableCell><Badge variant={o.status === "ACTIVE" ? "default" : o.status === "FULFILLED" ? "default" : "destructive"}>{o.status}</Badge></TableCell>
          <TableCell><div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setViewingBookings(o)}>
              {o.bookings.filter(b => b.status === "PENDING").length > 0 && <span className="mr-1.5 flex h-2 w-2 rounded-full bg-yellow-500"></span>}
              Bookings ({o.bookings.length})
            </Button>
            <Button variant="ghost" size="sm" onClick={() => openAssignModal(o)} disabled={!!busy || o.status === "CANCELLED"}>
              <TruckX size={13} className="mr-1" /> Assign
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(o)} disabled={!!busy}><Pencil size={13} className="mr-1" />Edit</Button>
            <Button variant="ghost" size="sm" onClick={() => cancelOrder(o)} disabled={!!busy || o.status === "CANCELLED"}><XCircle size={13} className="mr-1" />Cancel</Button>
          </div></TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={10} className="p-8 text-center text-sm text-muted-foreground">No orders created yet</TableCell></TableRow>}</TableBody>
      </Table>
    </CardContent>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Weighbridge Order</DialogTitle></DialogHeader>
        <form onSubmit={createOrder} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="o-type">Transaction Type</Label><select id="o-type" name="type" required className={selectClass()} value={createType} onChange={(e) => setCreateType(e.target.value as "DISPATCH" | "RECEIPT")}><option value="DISPATCH">Dispatch</option><option value="RECEIPT">Receipt</option></select></div>
          <div className="space-y-1.5"><Label htmlFor="o-site">Weighbridge</Label><select id="o-site" name="siteId" required className={selectClass()} defaultValue="">{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          {createType === "DISPATCH" ? <div className="space-y-1.5"><Label htmlFor="o-customer">Customer</Label><Input id="o-customer" name="customerName" required minLength={2} /></div>
            : <div className="space-y-1.5"><Label htmlFor="o-supplier">Supplier</Label><Input id="o-supplier" name="supplierName" required minLength={2} /></div>}
          <div className="space-y-1.5"><Label htmlFor="o-product">Product</Label><select id="o-product" name="productId" required className={selectClass()} defaultValue=""><option value="" disabled>Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="o-source">From (Source)</Label><select id="o-source" name="sourceId" required className={selectClass()} defaultValue=""><option value="" disabled>Select source</option>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="o-destination">To (Destination)</Label><select id="o-destination" name="destinationId" required className={selectClass()} defaultValue=""><option value="" disabled>Select destination</option>{destinations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="o-mass">Estimated Order Mass (t)</Label><Input id="o-mass" name="estimatedMassTons" type="number" step="0.1" required min={1} max={200} /></div>
          <div className="space-y-1.5"><Label htmlFor="o-stockpile">Stockpile</Label><Input id="o-stockpile" name="stockpile" /></div>
          <div className="space-y-1.5"><Label htmlFor="o-variance-pct">Variance Threshold (%)</Label><Input id="o-variance-pct" name="varianceThresholdPercent" type="number" step="0.1" min={0} max={25} defaultValue={5} /></div>
          <div className="space-y-1.5"><Label htmlFor="o-variance-tons">Threshold (Tons)</Label><Input id="o-variance-tons" name="varianceThresholdTons" type="number" step="0.1" min={0} max={50} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="o-notes">Order Notes / Special Instructions</Label><Input id="o-notes" name="notes" /></div>
          <div className="md:col-span-2"><Button type="submit" disabled={!!busy} className="w-full">{busy ? "Creating…" : "Create order"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {editing?.orderNumber}</DialogTitle></DialogHeader>
        {editing && <form onSubmit={saveEdit} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="eo-product">Product</Label><select id="eo-product" name="productId" required className={selectClass()} defaultValue={editing.productId || ""}><option value="" disabled>Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="eo-source">From (Source)</Label><select id="eo-source" name="sourceId" className={selectClass()} defaultValue={editing.sourceId || ""}><option value="">— None —</option>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="eo-destination">To (Destination)</Label><select id="eo-destination" name="destinationId" className={selectClass()} defaultValue={editing.destinationId || ""}><option value="">— None —</option>{destinations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="eo-mass">Estimated Order Mass (t)</Label><Input id="eo-mass" name="estimatedMassTons" type="number" step="0.1" required min={1} max={200} defaultValue={editing.estimatedMassKg / 1000} /></div>
          <div className="space-y-1.5"><Label htmlFor="eo-stockpile">Stockpile</Label><Input id="eo-stockpile" name="stockpile" defaultValue={editing.stockpile ?? ""} /></div>
          <div className="space-y-1.5"><Label htmlFor="eo-variance-pct">Variance Threshold (%)</Label><Input id="eo-variance-pct" name="varianceThresholdPercent" type="number" step="0.1" min={0} max={25} defaultValue={Number(editing.varianceThresholdPercent)} /></div>
          <div className="space-y-1.5"><Label htmlFor="eo-variance-tons">Threshold (Tons)</Label><Input id="eo-variance-tons" name="varianceThresholdTons" type="number" step="0.1" min={0} max={50} defaultValue={editing.varianceThresholdKg ? editing.varianceThresholdKg / 1000 : ""} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="eo-notes">Order Notes / Special Instructions</Label><Input id="eo-notes" name="notes" defaultValue={editing.notes ?? ""} /></div>
          <div className="md:col-span-2"><Button type="submit" disabled={!!busy} className="w-full">{busy ? "Saving…" : "Save changes"}</Button></div>
        </form>}
      </DialogContent>
    </Dialog>
    <Dialog open={!!viewingBookings} onOpenChange={(open) => !open && setViewingBookings(null)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Bookings for Order {viewingBookings?.orderNumber}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Transporter</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Product / Load</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {viewingBookings?.bookings.length ? viewingBookings.bookings.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.reference}</TableCell>
                  <TableCell className="text-xs">{b.transporterOrganisation?.name}</TableCell>
                  <TableCell className="font-mono">{b.vehicle.plate}</TableCell>
                  <TableCell className="text-xs">{b.driver.firstName} {b.driver.lastName}</TableCell>
                  <TableCell className="text-xs">{b.commodity} &middot; {(b.targetTonnageKg / 1000).toFixed(1)} t</TableCell>
                  <TableCell className="text-2xs">{new Date(b.windowStart).toLocaleString("en-ZA")}<br /><span className="text-muted-foreground">to {new Date(b.windowEnd).toLocaleString("en-ZA")}</span></TableCell>
                  <TableCell>
                    <Badge variant={b.status === "PENDING" ? "warning" : b.status === "REJECTED" ? "destructive" : "default"}>{b.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {b.status === "PENDING" && (
                      <div className="flex gap-1.5">
                        <Button size="sm" onClick={() => approveBooking(b.id)} disabled={!!busy}>Approve</Button>
                        <Button size="sm" variant="destructive" onClick={() => rejectBooking(b.id)} disabled={!!busy}>Reject</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                    No bookings created for this order yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!assigningOrder} onOpenChange={(open) => !open && setAssigningOrder(null)}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Assign Fleet to {assigningOrder?.orderNumber}</DialogTitle>
          <DialogDescription>Select a transporter, then build the trucks to dispatch for this order.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submitAssignment} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Transporter</Label>
              <select required className={selectClass()} value={selectedOrgId} onChange={e => fetchFleet(e.target.value)}>
                <option value="" disabled>Select transporter...</option>
                {organisations?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Window Start</Label>
              <Input name="windowStart" type="datetime-local" required defaultValue={new Date().toISOString().slice(0, 16)} />
            </div>
            <div className="space-y-1.5">
              <Label>Window End</Label>
              <Input name="windowEnd" type="datetime-local" required defaultValue={new Date(new Date().setHours(23, 59, 59, 999)).toISOString().slice(0, 16)} />
            </div>
          </div>
          
          <div className="space-y-2 border-t border-border pt-4">
            <Label>Booking Rows</Label>
            {bookingRows.map((row, index) => (
              <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-3">
                  <select required className={selectClass()} value={row.vehicleId} onChange={e => setBookingRows(rs => rs.map(r => r.id === row.id ? { ...r, vehicleId: e.target.value } : r))}>
                    <option value="" disabled>Select vehicle...</option>
                    {availableVehicles.map(v => <option key={v.id} value={v.id}>{v.plate} ({v.make})</option>)}
                  </select>
                </div>
                <div className="col-span-3">
                  <select required className={selectClass()} value={row.driverId} onChange={e => setBookingRows(rs => rs.map(r => r.id === row.id ? { ...r, driverId: e.target.value } : r))}>
                    <option value="" disabled>Select driver...</option>
                    {availableDrivers.map(d => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <select className={selectClass()} value={row.trailer1Id} onChange={e => setBookingRows(rs => rs.map(r => r.id === row.id ? { ...r, trailer1Id: e.target.value } : r))}>
                    <option value="">No trailer</option>
                    {availableTrailers.map(t => <option key={t.id} value={t.id}>{t.trailerId} {t.registrationNo ? `(${t.registrationNo})` : ""}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <select className={selectClass()} value={row.trailer2Id} onChange={e => setBookingRows(rs => rs.map(r => r.id === row.id ? { ...r, trailer2Id: e.target.value } : r))}>
                    <option value="">No trailer 2</option>
                    {availableTrailers.map(t => <option key={t.id} value={t.id}>{t.trailerId} {t.registrationNo ? `(${t.registrationNo})` : ""}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setBookingRows(rs => rs.filter(r => r.id !== row.id))} disabled={bookingRows.length === 1}>
                    <XCircle size={14} className="text-muted-foreground mr-1.5" /> Remove
                  </Button>
                </div>
              </div>
            ))}
            <div className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setBookingRows(rs => [...rs, { id: Date.now(), vehicleId: "", driverId: "", trailer1Id: "", trailer2Id: "" }])} disabled={!selectedOrgId}>
                <Plus size={14} className="mr-1.5" /> Add row
              </Button>
            </div>
          </div>
          
          <div className="flex justify-end pt-4 border-t border-border">
            <Button type="submit" disabled={!!busy || bookingRows.every(r => !r.vehicleId || !r.driverId)}>
              {busy ? "Assigning..." : `Create ${bookingRows.filter(r => r.vehicleId && r.driverId).length} Bookings`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

  </Card>;
}
