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

type ProductRow = {
  id: string; code: string | null; name: string; description: string | null;
  category: string | null; unitOfMeasure: string | null;
  minimumAllowedWeight: number | null; maximumAllowedWeight: number | null;
  isActive: boolean;
};

export function ProductManagement({ initialProducts }: { initialProducts: ProductRow[] }) {
  const [products, setProducts] = useState<ProductRow[]>(initialProducts);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const payload = {
        code: form.get("code") || null, name: form.get("name"), description: form.get("description") || null,
        category: form.get("category") || null, unitOfMeasure: form.get("unitOfMeasure") || "TONNE",
        minimumAllowedWeight: form.get("minimumAllowedWeight") ? Number(form.get("minimumAllowedWeight")) : null,
        maximumAllowedWeight: form.get("maximumAllowedWeight") ? Number(form.get("maximumAllowedWeight")) : null
      };
      const response = await fetch("/api/admin/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not add product");
      setProducts((current) => [body.data, ...current]);
      toast({ title: "Product added", body: body.data.name });
      formEl.reset();
      setCreateOpen(false);
    } catch (error) { toast({ title: "Could not add product", body: String(error), severity: "HIGH" }); }
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
        category: form.get("category") || null, unitOfMeasure: form.get("unitOfMeasure") || "TONNE",
        minimumAllowedWeight: form.get("minimumAllowedWeight") ? Number(form.get("minimumAllowedWeight")) : null,
        maximumAllowedWeight: form.get("maximumAllowedWeight") ? Number(form.get("maximumAllowedWeight")) : null,
        isActive: editing.isActive
      };
      const response = await fetch(`/api/admin/products/${editing.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update product");
      setProducts((current) => current.map((s) => s.id === editing.id ? body.data : s));
      toast({ title: "Product updated", body: body.data.name });
      setEditing(null);
    } catch (error) { toast({ title: "Could not update product", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function toggleStatus(product: ProductRow) {
    if (!confirm(`Are you sure you want to ${product.isActive ? "deactivate" : "activate"} this product?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...product, isActive: !product.isActive })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update status");
      setProducts((current) => current.map((s) => s.id === product.id ? { ...s, isActive: !s.isActive } : s));
      toast({ title: "Status updated", body: product.name });
    } catch (error) { toast({ title: "Could not update status", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setCreateOpen(true)}><Plus size={16} className="mr-2" />Add product</Button>
      </div>

      <div className="rounded-md border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>UOM</TableHead>
              <TableHead>Thresholds</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No products found.</TableCell></TableRow>
            ) : products.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.code || "-"}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.category || "-"}</TableCell>
                <TableCell>{s.unitOfMeasure}</TableCell>
                <TableCell>
                  {s.minimumAllowedWeight || s.maximumAllowedWeight ? (
                    <span className="text-xs">{s.minimumAllowedWeight || 0} - {s.maximumAllowedWeight || "∞"}</span>
                  ) : "-"}
                </TableCell>
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
          <DialogHeader><DialogTitle>Add product</DialogTitle></DialogHeader>
          <form onSubmit={createProduct} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label htmlFor="p-name">Name</Label><Input id="p-name" name="name" required /></div>
              <div className="space-y-1.5"><Label htmlFor="p-code">Code</Label><Input id="p-code" name="code" /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="p-desc">Description</Label><Input id="p-desc" name="description" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label htmlFor="p-category">Category</Label><Input id="p-category" name="category" /></div>
              <div className="space-y-1.5"><Label htmlFor="p-uom">Unit of measure</Label><Input id="p-uom" name="unitOfMeasure" defaultValue="TONNE" required /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label htmlFor="p-min">Min weight</Label><Input id="p-min" name="minimumAllowedWeight" type="number" /></div>
              <div className="space-y-1.5"><Label htmlFor="p-max">Max weight</Label><Input id="p-max" name="maximumAllowedWeight" type="number" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>Save product</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {editing && (
        <Dialog open={true} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit product</DialogTitle></DialogHeader>
            <form onSubmit={saveEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label htmlFor="ep-name">Name</Label><Input id="ep-name" name="name" required defaultValue={editing.name} /></div>
                <div className="space-y-1.5"><Label htmlFor="ep-code">Code</Label><Input id="ep-code" name="code" defaultValue={editing.code || ""} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="ep-desc">Description</Label><Input id="ep-desc" name="description" defaultValue={editing.description || ""} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label htmlFor="ep-category">Category</Label><Input id="ep-category" name="category" defaultValue={editing.category || ""} /></div>
                <div className="space-y-1.5"><Label htmlFor="ep-uom">Unit of measure</Label><Input id="ep-uom" name="unitOfMeasure" required defaultValue={editing.unitOfMeasure || "TONNE"} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label htmlFor="ep-min">Min weight</Label><Input id="ep-min" name="minimumAllowedWeight" type="number" defaultValue={editing.minimumAllowedWeight || ""} /></div>
                <div className="space-y-1.5"><Label htmlFor="ep-max">Max weight</Label><Input id="ep-max" name="maximumAllowedWeight" type="number" defaultValue={editing.maximumAllowedWeight || ""} /></div>
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
