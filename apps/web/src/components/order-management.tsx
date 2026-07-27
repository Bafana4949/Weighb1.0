"use client";
import { useState } from "react";
import { Pencil, Plus, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/providers";

type SiteOption = { id: string; name: string };
type OrderRow = {
  id: string; orderNumber: string; type: "DISPATCH" | "RECEIPT"; status: string;
  siteId: string; site: SiteOption; originSite: SiteOption | null; destinationSite: SiteOption | null;
  customerName: string | null; supplierName: string | null; product: string;
  estimatedMassKg: number; stockpile: string | null;
  varianceThresholdPercent: string | number; varianceThresholdKg: number | null;
  ratePerTonZar: string | number | null; notes: string | null;
  bookings: { transactions: { netWeightKg: number }[] }[];
};

function selectClass() { return "h-9 w-full rounded-sm border border-border bg-surface px-3 text-sm"; }
function fulfilledKg(order: OrderRow) { return order.bookings.reduce((sum, b) => sum + b.transactions.reduce((s, t) => s + t.netWeightKg, 0), 0); }

export function OrderManagement({ initialOrders, sites }: { initialOrders: OrderRow[]; sites: SiteOption[] }) {
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<"DISPATCH" | "RECEIPT">("DISPATCH");
  const [editing, setEditing] = useState<OrderRow | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function createOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const payload = {
        type: form.get("type"), siteId: form.get("siteId"),
        originSiteId: form.get("originSiteId") || undefined, destinationSiteId: form.get("destinationSiteId") || undefined,
        customerName: form.get("customerName") || undefined, supplierName: form.get("supplierName") || undefined,
        product: form.get("product"), estimatedMassKg: Math.round(Number(form.get("estimatedMassTons")) * 1000),
        stockpile: form.get("stockpile") || undefined,
        varianceThresholdPercent: form.get("varianceThresholdPercent") ? Number(form.get("varianceThresholdPercent")) : undefined,
        varianceThresholdKg: form.get("varianceThresholdTons") ? Math.round(Number(form.get("varianceThresholdTons")) * 1000) : undefined,
        ratePerTonZar: form.get("ratePerTonZar") ? Number(form.get("ratePerTonZar")) : undefined,
        notes: form.get("notes") || undefined,
      };
      const response = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create order");
      setOrders((current) => [{ ...body.data, bookings: [] }, ...current]);
      toast({ title: "Order created", body: body.data.orderNumber });
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
      const payload = {
        product: form.get("product"), estimatedMassKg: Math.round(Number(form.get("estimatedMassTons")) * 1000),
        stockpile: form.get("stockpile") || undefined,
        varianceThresholdPercent: form.get("varianceThresholdPercent") ? Number(form.get("varianceThresholdPercent")) : undefined,
        varianceThresholdKg: form.get("varianceThresholdTons") ? Math.round(Number(form.get("varianceThresholdTons")) * 1000) : undefined,
        ratePerTonZar: form.get("ratePerTonZar") ? Number(form.get("ratePerTonZar")) : undefined,
        notes: form.get("notes") || undefined,
      };
      const response = await fetch(`/api/orders/${editing.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update order");
      setOrders((current) => current.map((o) => o.id === editing.id ? { ...body.data, bookings: o.bookings } : o));
      toast({ title: "Order updated", body: body.data.orderNumber });
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

  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle>Manage Weighbridge Order</CardTitle>
      <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} className="mr-1.5" />New order</Button>
    </CardHeader>
    <CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Type</TableHead><TableHead>Weighbridge</TableHead><TableHead>Route</TableHead><TableHead>Customer / Supplier</TableHead><TableHead>Product</TableHead><TableHead>Progress</TableHead><TableHead>Rate</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
        <TableBody>{orders.length ? orders.map((o) => <TableRow key={o.id}>
          <TableCell className="font-mono">{o.orderNumber}</TableCell>
          <TableCell><Badge variant={o.type === "DISPATCH" ? "default" : "warning"}>{o.type}</Badge></TableCell>
          <TableCell className="text-xs">{o.site.name}</TableCell>
          <TableCell className="text-xs">{o.originSite?.name ?? "—"} → {o.destinationSite?.name ?? "—"}</TableCell>
          <TableCell className="text-xs">{o.customerName ?? o.supplierName ?? "—"}</TableCell>
          <TableCell>{o.product}{o.stockpile ? <p className="text-2xs text-muted-foreground">Stockpile {o.stockpile}</p> : null}</TableCell>
          <TableCell className="font-mono text-xs">{(fulfilledKg(o) / 1000).toFixed(1)} / {(o.estimatedMassKg / 1000).toFixed(1)} t</TableCell>
          <TableCell className="font-mono text-xs">{o.ratePerTonZar ? `R ${Number(o.ratePerTonZar).toFixed(2)}` : "—"}</TableCell>
          <TableCell><Badge variant={o.status === "ACTIVE" ? "default" : o.status === "FULFILLED" ? "default" : "destructive"}>{o.status}</Badge></TableCell>
          <TableCell><div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setEditing(o)} disabled={busy}><Pencil size={13} className="mr-1" />Edit</Button>
            <Button variant="ghost" size="sm" onClick={() => cancelOrder(o)} disabled={busy || o.status === "CANCELLED"}><XCircle size={13} className="mr-1" />Cancel</Button>
          </div></TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={10} className="p-8 text-center text-sm text-muted-foreground">No orders created yet</TableCell></TableRow>}</TableBody>
      </Table>
    </CardContent>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Manage Weighbridge Order</DialogTitle></DialogHeader>
        <form onSubmit={createOrder} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="o-type">Transaction Type</Label><select id="o-type" name="type" required className={selectClass()} value={createType} onChange={(e) => setCreateType(e.target.value as "DISPATCH" | "RECEIPT")}><option value="DISPATCH">Dispatch</option><option value="RECEIPT">Receipt</option></select></div>
          <div className="space-y-1.5"><Label htmlFor="o-site">Weighbridge</Label><select id="o-site" name="siteId" required className={selectClass()} defaultValue="">{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          {createType === "DISPATCH" ? <div className="space-y-1.5"><Label htmlFor="o-customer">Customer</Label><Input id="o-customer" name="customerName" required minLength={2} /></div>
            : <div className="space-y-1.5"><Label htmlFor="o-supplier">Supplier</Label><Input id="o-supplier" name="supplierName" required minLength={2} /></div>}
          <div className="space-y-1.5"><Label htmlFor="o-product">Product</Label><Input id="o-product" name="product" required minLength={2} placeholder="Coal" /></div>
          <div className="space-y-1.5"><Label htmlFor="o-origin">From (Origin)</Label><select id="o-origin" name="originSiteId" required className={selectClass()} defaultValue=""><option value="" disabled>Select origin</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="o-destination">To (Destination)</Label><select id="o-destination" name="destinationSiteId" required className={selectClass()} defaultValue=""><option value="" disabled>Select destination</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="o-mass">Estimated Order Mass (t)</Label><Input id="o-mass" name="estimatedMassTons" type="number" step="0.1" required min={1} max={200} /></div>
          <div className="space-y-1.5"><Label htmlFor="o-stockpile">Stockpile</Label><Input id="o-stockpile" name="stockpile" /></div>
          <div className="space-y-1.5"><Label htmlFor="o-variance-pct">Variance Threshold (%)</Label><Input id="o-variance-pct" name="varianceThresholdPercent" type="number" step="0.1" min={0} max={25} defaultValue={5} /></div>
          <div className="space-y-1.5"><Label htmlFor="o-variance-tons">Threshold (Tons)</Label><Input id="o-variance-tons" name="varianceThresholdTons" type="number" step="0.1" min={0} max={50} /></div>
          <div className="space-y-1.5"><Label htmlFor="o-rate">Rate Per Ton (ZAR)</Label><Input id="o-rate" name="ratePerTonZar" type="number" step="0.01" min={0} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="o-notes">Order Notes / Special Instructions</Label><Input id="o-notes" name="notes" /></div>
          <div className="md:col-span-2"><Button type="submit" disabled={busy} className="w-full">{busy ? "Creating…" : "Create order"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {editing?.orderNumber}</DialogTitle></DialogHeader>
        {editing && <form onSubmit={saveEdit} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="eo-product">Product</Label><Input id="eo-product" name="product" required minLength={2} defaultValue={editing.product} /></div>
          <div className="space-y-1.5"><Label htmlFor="eo-mass">Estimated Order Mass (t)</Label><Input id="eo-mass" name="estimatedMassTons" type="number" step="0.1" required min={1} max={200} defaultValue={editing.estimatedMassKg / 1000} /></div>
          <div className="space-y-1.5"><Label htmlFor="eo-stockpile">Stockpile</Label><Input id="eo-stockpile" name="stockpile" defaultValue={editing.stockpile ?? ""} /></div>
          <div className="space-y-1.5"><Label htmlFor="eo-variance-pct">Variance Threshold (%)</Label><Input id="eo-variance-pct" name="varianceThresholdPercent" type="number" step="0.1" min={0} max={25} defaultValue={Number(editing.varianceThresholdPercent)} /></div>
          <div className="space-y-1.5"><Label htmlFor="eo-variance-tons">Threshold (Tons)</Label><Input id="eo-variance-tons" name="varianceThresholdTons" type="number" step="0.1" min={0} max={50} defaultValue={editing.varianceThresholdKg ? editing.varianceThresholdKg / 1000 : ""} /></div>
          <div className="space-y-1.5"><Label htmlFor="eo-rate">Rate Per Ton (ZAR)</Label><Input id="eo-rate" name="ratePerTonZar" type="number" step="0.01" min={0} defaultValue={editing.ratePerTonZar ? Number(editing.ratePerTonZar) : ""} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="eo-notes">Order Notes / Special Instructions</Label><Input id="eo-notes" name="notes" defaultValue={editing.notes ?? ""} /></div>
          <div className="md:col-span-2"><Button type="submit" disabled={busy} className="w-full">{busy ? "Saving…" : "Save changes"}</Button></div>
        </form>}
      </DialogContent>
    </Dialog>
  </Card>;
}
