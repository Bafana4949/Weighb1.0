"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/providers";

const CATEGORIES = ["HARDWARE", "SOFTWARE", "NETWORK", "ANPR", "SCALE", "GATE", "PRINTER", "REPORTING", "USER_ACCESS", "CALIBRATION", "TRAINING", "OTHER"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
function selectClass() { return "h-9 w-full rounded-sm border border-border bg-surface px-3 text-sm"; }
function priorityVariant(p: string) { return p === "CRITICAL" ? "destructive" : p === "HIGH" ? "warning" : p === "MEDIUM" ? "info" : "muted"; }
function statusVariant(s: string) { return s === "OPEN" ? "destructive" : s === "RESOLVED" || s === "CLOSED" ? "default" : "warning"; }

type OrgOption = { id: string; name: string };
type ServiceOrderRow = {
  id: string; orderNumber: string; title: string; category: string; priority: string; status: string;
  createdAt: string; organisation: { name: string } | null; site: { name: string } | null; assignedTo: { firstName: string; lastName: string } | null;
};

export function ServiceOrderManagement({ initialOrders, organisations, isSuperAdmin }: { initialOrders: ServiceOrderRow[]; organisations: OrgOption[]; isSuperAdmin: boolean }) {
  const [orders, setOrders] = useState<ServiceOrderRow[]>(initialOrders);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function createOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const payload = {
        organisationId: isSuperAdmin ? form.get("organisationId") : undefined,
        title: form.get("title"), description: form.get("description"), category: form.get("category"), priority: form.get("priority"),
        contactName: form.get("contactName") || null, contactPhone: form.get("contactPhone") || null, contactEmail: form.get("contactEmail") || null,
      };
      const response = await fetch("/api/service-orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create service order");
      setOrders((current) => [body.data, ...current]);
      toast({ title: "Service order created", body: body.data.orderNumber });
      formEl.reset();
      setCreateOpen(false);
    } catch (error) { toast({ title: "Could not create service order", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle>Service orders</CardTitle>
      <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} className="mr-1.5" />New ticket</Button>
    </CardHeader>
    <CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Ticket</TableHead><TableHead>Client</TableHead><TableHead>Category</TableHead><TableHead>Priority</TableHead><TableHead>Assigned</TableHead><TableHead>Status</TableHead><TableHead>Opened</TableHead></TableRow></TableHeader>
        <TableBody>{orders.length ? orders.map((o) => <TableRow key={o.id}>
          <TableCell><Link href={`/admin/service-orders/${o.id}`} className="flex items-center gap-1.5 font-medium text-primary hover:underline"><Wrench size={13} />{o.orderNumber}</Link><p className="text-xs text-muted-foreground">{o.title}</p></TableCell>
          <TableCell className="text-xs">{o.organisation?.name ?? "—"}{o.site ? <p className="text-2xs text-muted-foreground">{o.site.name}</p> : null}</TableCell>
          <TableCell className="text-xs">{o.category.replace(/_/g, " ")}</TableCell>
          <TableCell><Badge variant={priorityVariant(o.priority)}>{o.priority}</Badge></TableCell>
          <TableCell className="text-xs">{o.assignedTo ? `${o.assignedTo.firstName} ${o.assignedTo.lastName}` : "Unassigned"}</TableCell>
          <TableCell><Badge variant={statusVariant(o.status)}>{o.status.replace(/_/g, " ")}</Badge></TableCell>
          <TableCell className="text-2xs">{new Date(o.createdAt).toLocaleDateString("en-ZA")}</TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={7} className="p-8 text-center text-sm text-muted-foreground">No service orders yet</TableCell></TableRow>}</TableBody>
      </Table>
    </CardContent>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>New service order</DialogTitle></DialogHeader>
        <form onSubmit={createOrder} className="grid gap-3 md:grid-cols-2">
          {isSuperAdmin && <div className="space-y-1.5 md:col-span-2"><Label htmlFor="so-org">Client</Label><select id="so-org" name="organisationId" required className={selectClass()} defaultValue="">{organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>}
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="so-title">Title</Label><Input id="so-title" name="title" required minLength={3} placeholder="ANPR camera offline at north gate" /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="so-desc">Description</Label><textarea id="so-desc" name="description" required minLength={5} rows={4} className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm" /></div>
          <div className="space-y-1.5"><Label htmlFor="so-category">Category</Label><select id="so-category" name="category" required className={selectClass()} defaultValue="OTHER">{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="so-priority">Priority</Label><select id="so-priority" name="priority" required className={selectClass()} defaultValue="MEDIUM">{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="so-cname">Contact name (optional)</Label><Input id="so-cname" name="contactName" /></div>
          <div className="space-y-1.5"><Label htmlFor="so-cphone">Contact phone (optional)</Label><Input id="so-cphone" name="contactPhone" /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="so-cemail">Contact email (optional)</Label><Input id="so-cemail" name="contactEmail" type="email" /></div>
          <div className="md:col-span-2"><Button type="submit" disabled={busy} className="w-full">{busy ? "Creating…" : "Create ticket"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </Card>;
}
