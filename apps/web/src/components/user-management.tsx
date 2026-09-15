"use client";
import { useState } from "react";
import { KeyRound, Pencil, Plus, UserX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/providers";

type OrgOption = { id: string; name: string };
type Role = "TRANSPORTER" | "OPERATOR" | "ADMIN" | "SECURITY";
type Status = "ACTIVE" | "SUSPENDED" | "INVITED";
type RoleType = { id: string; name: string; isBuiltIn: boolean };
type UserRow = {
  id: string; email: string; firstName: string; lastName: string; phone: string | null;
  role: Role; status: Status; organisationId: string | null;
  organisation: OrgOption | null; lastLoginAt: string | Date | null;
  roleAssignments?: { roleId: string; role: RoleType }[];
};

const ROLES: Role[] = ["ADMIN", "OPERATOR", "SECURITY", "TRANSPORTER"];
const STATUSES: Status[] = ["ACTIVE", "SUSPENDED", "INVITED"];

function selectClass() { return "h-9 w-full rounded-sm border border-border bg-surface px-3 text-sm"; }

export function UserManagement({ initialUsers, organisations, roles, currentUserId }: { initialUsers: UserRow[]; organisations: OrgOption[]; roles: RoleType[]; currentUserId: string }) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const payload = {
        firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"),
        phone: form.get("phone") || null, password: form.get("password"), 
        organisationId: form.get("organisationId") || null,
        roleIds: form.getAll("roleIds") as string[]
      };
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create user");
      
      const enrichedUser = {
        ...body.data,
        organisation: organisations.find((o) => o.id === body.data.organisationId) ?? null,
        roleAssignments: body.data.roleAssignments?.map((a: any) => ({
          ...a,
          role: roles.find(r => r.id === a.roleId) || { id: a.roleId, name: "Unknown", isBuiltIn: false }
        }))
      };
      
      setUsers((current) => [enrichedUser, ...current]);
      toast({ title: "User created", body: `${body.data.firstName} ${body.data.lastName} · ${body.data.role}` });
      formEl.reset();
      setCreateOpen(false);
    } catch (error) { toast({ title: "Could not create user", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const payload = {
        firstName: form.get("firstName"), lastName: form.get("lastName"), phone: form.get("phone") || null,
        status: form.get("status"), organisationId: form.get("organisationId") || null,
        roleIds: form.getAll("roleIds") as string[]
      };
      const response = await fetch(`/api/admin/users/${editing.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update user");

      const enrichedUser = {
        ...body.data,
        organisation: organisations.find((o) => o.id === body.data.organisationId) ?? null,
        roleAssignments: body.data.roleAssignments?.map((a: any) => ({
          ...a,
          role: roles.find(r => r.id === a.roleId) || { id: a.roleId, name: "Unknown", isBuiltIn: false }
        }))
      };

      setUsers((current) => current.map((u) => u.id === editing.id ? enrichedUser : u));
      toast({ title: "User updated", body: `${body.data.firstName} ${body.data.lastName}` });
      setEditing(null);
    } catch (error) { toast({ title: "Could not update user", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function resetPassword(user: UserRow) {
    const password = window.prompt(`New password for ${user.firstName} ${user.lastName} (at least 8 characters):`);
    if (!password) return;
    if (password.length < 8) { toast({ title: "Password not changed", body: "Password must be at least 8 characters", severity: "MEDIUM" }); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/password`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not reset password");
      toast({ title: "Password reset", body: `${user.firstName} ${user.lastName}` });
    } catch (error) { toast({ title: "Could not reset password", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function deactivate(user: UserRow) {
    if (!window.confirm(`Deactivate ${user.firstName} ${user.lastName}? They will no longer be able to sign in.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not deactivate user");
      setUsers((current) => current.map((u) => u.id === user.id ? { ...u, status: "SUSPENDED" } : u));
      toast({ title: "User deactivated", body: `${user.firstName} ${user.lastName}` });
    } catch (error) { toast({ title: "Could not deactivate user", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle>User and role management</CardTitle>
      <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} className="mr-1.5" />New user</Button>
    </CardHeader>
    <CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Organisation</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Last login</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
        <TableBody>{users.map((u) => <TableRow key={u.id}>
          <TableCell><p>{u.firstName} {u.lastName}{u.id === currentUserId && <span className="ml-1.5 text-2xs text-muted-foreground">(you)</span>}</p><p className="text-xs text-muted-foreground">{u.email}</p></TableCell>
          <TableCell>{u.organisation?.name ?? "Enterprise"}</TableCell>
          <TableCell>
            <div className="flex flex-wrap gap-1">
              {u.roleAssignments && u.roleAssignments.length > 0 
                ? u.roleAssignments.map(a => <Badge key={a.roleId} variant="info">{a.role.name}</Badge>)
                : <Badge variant="muted">{u.role}</Badge>
              }
            </div>
          </TableCell>
          <TableCell><Badge variant={u.status === "ACTIVE" ? "default" : u.status === "INVITED" ? "warning" : "destructive"}>{u.status}</Badge></TableCell>
          <TableCell className="font-mono text-xs">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("en-ZA") : "Never"}</TableCell>
          <TableCell><div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setEditing(u)} disabled={busy}><Pencil size={13} className="mr-1" />Edit</Button>
            <Button variant="ghost" size="sm" onClick={() => resetPassword(u)} disabled={busy}><KeyRound size={13} className="mr-1" />Reset password</Button>
            <Button variant="ghost" size="sm" onClick={() => deactivate(u)} disabled={busy || u.id === currentUserId || u.status === "SUSPENDED"}><UserX size={13} className="mr-1" />Deactivate</Button>
          </div></TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </CardContent>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>New user</DialogTitle></DialogHeader>
        <form onSubmit={createUser} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="c-firstName">First name</Label><Input id="c-firstName" name="firstName" required minLength={2} /></div>
          <div className="space-y-1.5"><Label htmlFor="c-lastName">Last name</Label><Input id="c-lastName" name="lastName" required minLength={2} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="c-email">Email</Label><Input id="c-email" name="email" type="email" required /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="c-password">Initial password</Label><Input id="c-password" name="password" type="password" required minLength={12} placeholder="At least 12 characters" /></div>
          <div className="space-y-1.5"><Label htmlFor="c-phone">Phone (optional)</Label><Input id="c-phone" name="phone" /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="c-roleIds">Roles</Label><select id="c-roleIds" name="roleIds" multiple size={4} className={selectClass() + " h-auto py-2"}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name} {r.isBuiltIn ? "(Built-in)" : "(Custom)"}</option>)}</select><p className="text-xs text-muted-foreground">Hold Ctrl/Cmd to select multiple.</p></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="c-org">Organisation (optional)</Label><select id="c-org" name="organisationId" className={selectClass()} defaultValue=""><option value="">— None —</option>{organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
          <div className="md:col-span-2"><Button type="submit" disabled={busy} className="w-full">{busy ? "Creating…" : "Create user"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {editing?.firstName} {editing?.lastName}</DialogTitle></DialogHeader>
        {editing && <form onSubmit={saveEdit} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="e-firstName">First name</Label><Input id="e-firstName" name="firstName" required minLength={2} defaultValue={editing.firstName} /></div>
          <div className="space-y-1.5"><Label htmlFor="e-lastName">Last name</Label><Input id="e-lastName" name="lastName" required minLength={2} defaultValue={editing.lastName} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Email</Label><p className="flex h-9 items-center rounded-sm border border-border bg-muted px-3 text-sm text-muted-foreground">{editing.email}</p></div>
          <div className="space-y-1.5"><Label htmlFor="e-phone">Phone</Label><Input id="e-phone" name="phone" defaultValue={editing.phone ?? ""} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="e-roleIds">Roles</Label><select id="e-roleIds" name="roleIds" multiple size={4} className={selectClass() + " h-auto py-2"} defaultValue={editing.roleAssignments?.map(a => a.roleId) || []}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name} {r.isBuiltIn ? "(Built-in)" : "(Custom)"}</option>)}</select><p className="text-xs text-muted-foreground">Hold Ctrl/Cmd to select multiple.</p></div>
          <div className="space-y-1.5"><Label htmlFor="e-status">Status</Label><select id="e-status" name="status" required className={selectClass()} defaultValue={editing.status}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="e-org">Organisation</Label><select id="e-org" name="organisationId" className={selectClass()} defaultValue={editing.organisationId ?? ""}><option value="">— None —</option>{organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
          <div className="md:col-span-2"><Button type="submit" disabled={busy} className="w-full">{busy ? "Saving…" : "Save changes"}</Button></div>
        </form>}
      </DialogContent>
    </Dialog>
  </Card>;
}
