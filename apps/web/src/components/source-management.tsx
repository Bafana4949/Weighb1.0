"use client";
import { useState } from "react";
import { Pencil, Plus, Power } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/providers";

type SourceRow = {
  id: string; code: string | null; name: string; description: string | null;
  address: string | null; contactPerson: string | null; contactPhone: string | null;
  latitude: number | null; longitude: number | null; isActive: boolean;
};

export function SourceManagement({ initialSources }: { initialSources: SourceRow[] }) {
  const [sources, setSources] = useState<SourceRow[]>(initialSources);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SourceRow | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function createSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const payload = {
        code: form.get("code") || null, name: form.get("name"), description: form.get("description") || null,
        address: form.get("address") || null, contactPerson: form.get("contactPerson") || null,
        contactPhone: form.get("contactPhone") || null, latitude: form.get("latitude") ? Number(form.get("latitude")) : null,
        longitude: form.get("longitude") ? Number(form.get("longitude")) : null
      };
      const response = await fetch("/api/admin/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not add source");
      setSources((current) => [body.data, ...current]);
      toast({ title: "Source added", body: body.data.name });
      formEl.reset();
      setCreateOpen(false);
    } catch (error) { toast({ title: "Could not add source", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const payload = {
        code: form.get("code") || null, name: form.get("name"), description: form.get("description") || null,
        address: form.get("address") || null, contactPerson: form.get("contactPerson") || null,
        contactPhone: form.get("contactPhone") || null, latitude: form.get("latitude") ? Number(form.get("latitude")) : null,
        longitude: form.get("longitude") ? Number(form.get("longitude")) : null, isActive: editing.isActive
      };
      const response = await fetch(`/api/admin/sources/${editing.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update source");
      setSources((current) => current.map((s) => s.id === editing.id ? body.data : s));
      toast({ title: "Source updated", body: body.data.name });
      setEditing(null);
    } catch (error) { toast({ title: "Could not update source", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function toggleStatus(source: SourceRow) {
    if (!confirm(`Are you sure you want to ${source.isActive ? "deactivate" : "activate"} this source?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/sources/${source.id}`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...source, isActive: !source.isActive })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update status");
      setSources((current) => current.map((s) => s.id === source.id ? { ...s, isActive: !s.isActive } : s));
      toast({ title: "Status updated", body: source.name });
    } catch (error) { toast({ title: "Could not update status", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setCreateOpen(true)}><Plus size={16} className="mr-2" />Add source</Button>
      </div>

      <div className="rounded-md border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No sources found.</TableCell></TableRow>
            ) : sources.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.code || "-"}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.address || "-"}</TableCell>
                <TableCell>{s.contactPerson || "-"} <span className="text-muted-foreground block text-xs">{s.contactPhone}</span></TableCell>
                <TableCell><Badge variant={s.isActive ? "default" : "muted"}>{s.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(s)}><Pencil size={14} /></Button>
                  <Button variant="ghost" size="icon" onClick={() => toggleStatus(s)}><Power size={14} className={s.isActive ? "text-destructive" : "text-success"} /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add source</DialogTitle></DialogHeader>
          <form onSubmit={createSource} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label htmlFor="s-name">Name</Label><Input id="s-name" name="name" required /></div>
              <div className="space-y-1.5"><Label htmlFor="s-code">Code</Label><Input id="s-code" name="code" /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="s-desc">Description</Label><Input id="s-desc" name="description" /></div>
            <div className="space-y-1.5"><Label htmlFor="s-address">Address</Label><Input id="s-address" name="address" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label htmlFor="s-contact">Contact Person</Label><Input id="s-contact" name="contactPerson" /></div>
              <div className="space-y-1.5"><Label htmlFor="s-phone">Contact Phone</Label><Input id="s-phone" name="contactPhone" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>Save source</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {editing && (
        <Dialog open={true} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit source</DialogTitle></DialogHeader>
            <form onSubmit={saveEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label htmlFor="es-name">Name</Label><Input id="es-name" name="name" required defaultValue={editing.name} /></div>
                <div className="space-y-1.5"><Label htmlFor="es-code">Code</Label><Input id="es-code" name="code" defaultValue={editing.code || ""} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="es-desc">Description</Label><Input id="es-desc" name="description" defaultValue={editing.description || ""} /></div>
              <div className="space-y-1.5"><Label htmlFor="es-address">Address</Label><Input id="es-address" name="address" defaultValue={editing.address || ""} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label htmlFor="es-contact">Contact Person</Label><Input id="es-contact" name="contactPerson" defaultValue={editing.contactPerson || ""} /></div>
                <div className="space-y-1.5"><Label htmlFor="es-phone">Contact Phone</Label><Input id="es-phone" name="contactPhone" defaultValue={editing.contactPhone || ""} /></div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={busy}>Save changes</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
