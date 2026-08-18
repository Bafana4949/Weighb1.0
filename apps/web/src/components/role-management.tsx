"use client";
import { useState } from "react";
import { Plus, ShieldCheck, Trash2, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/providers";

type Permission = { id: string; key: string; description: string; category: string };
type RoleRow = {
  id: string; name: string; isBuiltIn: boolean; organisationId: string | null;
  permissions: { permission: Permission }[]; _count: { assignments: number };
};

export function RoleManagement({ initialRoles, permissions }: { initialRoles: RoleRow[]; permissions: Permission[] }) {
  const [roles, setRoles] = useState<RoleRow[]>(initialRoles);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const categories = [...new Set(permissions.map((p) => p.category))];

  async function createRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const permissionKeys = permissions.filter((p) => form.get(`perm-${p.key}`) === "on").map((p) => p.key);
    if (!permissionKeys.length) { toast({ title: "Select at least one permission", body: "", severity: "MEDIUM" }); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/roles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), permissionKeys }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create role");
      setRoles((current) => [...current, { ...body.data, _count: { assignments: 0 } }]);
      toast({ title: "Role created", body: body.data.name });
      formEl.reset();
      setCreateOpen(false);
    } catch (error) { toast({ title: "Could not create role", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function editRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRole) return;
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const permissionKeys = permissions.filter((p) => form.get(`perm-${p.key}`) === "on").map((p) => p.key);
    if (!permissionKeys.length) { toast({ title: "Select at least one permission", body: "", severity: "MEDIUM" }); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/roles/${editingRole.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), permissionKeys }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update role");
      setRoles((current) => current.map((r) => r.id === editingRole.id ? { ...body.data, _count: r._count } : r));
      toast({ title: "Role updated", body: body.data.name });
      setEditingRole(null);
    } catch (error) { toast({ title: "Could not update role", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function deleteRole(role: RoleRow) {
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not delete role");
      setRoles((current) => current.filter((r) => r.id !== role.id));
      toast({ title: "Role deleted", body: role.name });
    } catch (error) { toast({ title: "Could not delete role", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle>Roles and permissions</CardTitle>
      <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} className="mr-1.5" />New custom role</Button>
    </CardHeader>
    <CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Type</TableHead><TableHead>Permissions</TableHead><TableHead>Assigned users</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
        <TableBody>{roles.map((r) => <TableRow key={r.id}>
          <TableCell><p className="flex items-center gap-1.5 font-medium"><ShieldCheck size={13} className="text-muted-foreground" />{r.name}</p></TableCell>
          <TableCell><Badge variant={r.isBuiltIn ? "info" : "default"}>{r.isBuiltIn ? "Built-in" : "Custom"}</Badge></TableCell>
          <TableCell className="text-xs text-muted-foreground">{r.permissions.length} permissions</TableCell>
          <TableCell className="text-xs">{r._count.assignments}</TableCell>
          <TableCell>{!r.isBuiltIn && <div className="flex gap-1.5"><Button variant="ghost" size="sm" onClick={() => setEditingRole(r)} disabled={busy}><Pencil size={13} className="mr-1" />Edit</Button><Button variant="ghost" size="sm" onClick={() => deleteRole(r)} disabled={busy}><Trash2 size={13} className="mr-1" />Delete</Button></div>}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </CardContent>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>New custom role</DialogTitle></DialogHeader>
        <form onSubmit={createRole} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="role-name">Role name</Label><Input id="role-name" name="name" required minLength={2} placeholder="Yard Supervisor" /></div>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {categories.map((category) => <div key={category}>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{category}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {permissions.filter((p) => p.category === category).map((p) => <label key={p.key} className="flex items-center gap-2 text-sm"><input type="checkbox" name={`perm-${p.key}`} />{p.description}</label>)}
              </div>
            </div>)}
          </div>
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Creating…" : "Create role"}</Button>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={editingRole !== null} onOpenChange={(open) => { if (!open) setEditingRole(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit custom role</DialogTitle></DialogHeader>
        {editingRole && <form onSubmit={editRole} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="edit-role-name">Role name</Label><Input id="edit-role-name" name="name" required minLength={2} defaultValue={editingRole.name} /></div>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {categories.map((category) => <div key={category}>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{category}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {permissions.filter((p) => p.category === category).map((p) => {
                  const isChecked = editingRole.permissions.some(rp => rp.permission.key === p.key);
                  return <label key={p.key} className="flex items-center gap-2 text-sm"><input type="checkbox" name={`perm-${p.key}`} defaultChecked={isChecked} />{p.description}</label>;
                })}
              </div>
            </div>)}
          </div>
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Saving…" : "Save changes"}</Button>
        </form>}
      </DialogContent>
    </Dialog>
  </Card>;
}
