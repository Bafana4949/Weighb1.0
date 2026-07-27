"use client";
import { useState } from "react";
import { Building2, CheckCircle2, KeyRound, Plus, Power, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/providers";

type LoginUser = { id: string; firstName: string; lastName: string; email: string; status: string };
type TransporterRow = {
  id: string; name: string; registrationNo: string | null; contactEmail: string | null; contactPhone: string | null;
  isActive: boolean; users: LoginUser[]; _count: { vehicles: number; drivers: number };
};

// A company that self-applied and has never been approved still has an INVITED
// login; once approved (or created directly by admin) its users move to ACTIVE.
// A company an admin later deactivates has SUSPENDED users instead. That
// difference is what separates "pending application" from "deactivated".
function isPendingApplication(t: TransporterRow) { return !t.isActive && t.users.some((u) => u.status === "INVITED"); }

export function TransporterManagement({ initialTransporters }: { initialTransporters: TransporterRow[] }) {
  const [transporters, setTransporters] = useState<TransporterRow[]>(initialTransporters);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  async function createTransporter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy("create");
    try {
      const payload = {
        companyName: form.get("companyName"), registrationNo: form.get("registrationNo") || null,
        contactEmail: form.get("contactEmail") || null, contactPhone: form.get("contactPhone") || null,
        firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"),
        password: form.get("password"), phone: form.get("phone") || null,
      };
      const response = await fetch("/api/admin/transporters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not register transporter");
      setTransporters((current) => [{ ...body.data, _count: { vehicles: 0, drivers: 0 } }, ...current]);
      toast({ title: "Transporter registered", body: `${body.data.name} · login ${body.data.users[0]?.email}` });
      formEl.reset();
      setCreateOpen(false);
    } catch (error) { toast({ title: "Could not register transporter", body: String(error), severity: "HIGH" }); }
    finally { setBusy(null); }
  }

  async function approve(t: TransporterRow) {
    setBusy(t.id);
    try {
      const response = await fetch(`/api/admin/transporters/${t.id}/approve`, { method: "PUT" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not approve transporter");
      setTransporters((current) => current.map((x) => x.id === t.id ? { ...x, isActive: true, users: x.users.map((u) => ({ ...u, status: "ACTIVE" })) } : x));
      toast({ title: "Transporter approved", body: t.name });
    } catch (error) { toast({ title: "Could not approve transporter", body: String(error), severity: "HIGH" }); }
    finally { setBusy(null); }
  }

  async function reject(t: TransporterRow) {
    const reason = window.prompt(`Reason for rejecting ${t.name}'s application (at least 10 characters):`);
    if (!reason || reason.trim().length < 10) { toast({ title: "Rejection cancelled", body: "A reason of at least 10 characters is required", severity: "MEDIUM" }); return; }
    setBusy(t.id);
    try {
      const response = await fetch(`/api/admin/transporters/${t.id}/reject`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: reason.trim() }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not reject transporter");
      setTransporters((current) => current.filter((x) => x.id !== t.id));
      toast({ title: "Application rejected", body: t.name });
    } catch (error) { toast({ title: "Could not reject application", body: String(error), severity: "HIGH" }); }
    finally { setBusy(null); }
  }

  async function resetPassword(user: LoginUser) {
    const password = window.prompt(`New password for ${user.firstName} ${user.lastName} (at least 12 characters):`);
    if (!password) return;
    if (password.length < 12) { toast({ title: "Password not changed", body: "Password must be at least 12 characters", severity: "MEDIUM" }); return; }
    setBusy(user.id);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/password`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not reset password");
      toast({ title: "Password reset", body: `${user.firstName} ${user.lastName}` });
    } catch (error) { toast({ title: "Could not reset password", body: String(error), severity: "HIGH" }); }
    finally { setBusy(null); }
  }

  async function deactivate(transporter: TransporterRow) {
    if (!window.confirm(`Deactivate ${transporter.name}? All of their logins will be suspended immediately.`)) return;
    setBusy(transporter.id);
    try {
      const response = await fetch(`/api/admin/transporters/${transporter.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not deactivate transporter");
      setTransporters((current) => current.map((t) => t.id === transporter.id ? { ...t, isActive: false, users: t.users.map((u) => ({ ...u, status: "SUSPENDED" })) } : t));
      toast({ title: "Transporter deactivated", body: transporter.name });
    } catch (error) { toast({ title: "Could not deactivate transporter", body: String(error), severity: "HIGH" }); }
    finally { setBusy(null); }
  }

  const applications = transporters.filter(isPendingApplication);
  const others = transporters.filter((t) => !isPendingApplication(t));

  return <div className="space-y-4">
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Applications awaiting approval</CardTitle>
        <Badge variant={applications.length ? "warning" : "default"}>{applications.length} pending</Badge>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Company</TableHead><TableHead>Registration</TableHead><TableHead>Contact</TableHead><TableHead>Applicant login</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{applications.length ? applications.map((t) => <TableRow key={t.id}>
            <TableCell><p className="flex items-center gap-1.5 font-medium"><Building2 size={13} className="text-muted-foreground" />{t.name}</p></TableCell>
            <TableCell className="font-mono text-xs">{t.registrationNo ?? "—"}</TableCell>
            <TableCell className="text-xs">{t.contactEmail ?? "—"}<p className="text-2xs text-muted-foreground">{t.contactPhone ?? ""}</p></TableCell>
            <TableCell className="text-xs">{t.users.map((u) => <p key={u.id}>{u.firstName} {u.lastName} · <span className="text-muted-foreground">{u.email}</span></p>)}</TableCell>
            <TableCell><div className="flex gap-1.5">
              <Button size="sm" disabled={busy === t.id} onClick={() => approve(t)}><CheckCircle2 size={13} className="mr-1" />Approve</Button>
              <Button size="sm" variant="destructive" disabled={busy === t.id} onClick={() => reject(t)}><XCircle size={13} className="mr-1" />Reject</Button>
            </div></TableCell>
          </TableRow>) : <TableRow><TableCell colSpan={5} className="p-8 text-center text-sm text-muted-foreground">No applications waiting on review</TableCell></TableRow>}</TableBody>
        </Table>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Transporters</CardTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} className="mr-1.5" />New transporter</Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Company</TableHead><TableHead>Registration</TableHead><TableHead>Contact</TableHead><TableHead>Logins</TableHead><TableHead>Fleet</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{others.length ? others.map((t) => <TableRow key={t.id}>
            <TableCell><p className="flex items-center gap-1.5 font-medium"><Building2 size={13} className="text-muted-foreground" />{t.name}</p></TableCell>
            <TableCell className="font-mono text-xs">{t.registrationNo ?? "—"}</TableCell>
            <TableCell className="text-xs">{t.contactEmail ?? "—"}<p className="text-2xs text-muted-foreground">{t.contactPhone ?? ""}</p></TableCell>
            <TableCell className="text-xs">{t.users.map((u) => <p key={u.id} className="flex items-center gap-1.5">{u.firstName} {u.lastName} · <span className="text-muted-foreground">{u.email}</span> {u.status !== "ACTIVE" && <Badge variant="destructive">{u.status}</Badge>}<button type="button" onClick={() => resetPassword(u)} disabled={busy === u.id} className="text-muted-foreground hover:text-foreground" title="Reset password"><KeyRound size={12} /></button></p>)}</TableCell>
            <TableCell className="text-xs">{t._count.vehicles} vehicles · {t._count.drivers} drivers</TableCell>
            <TableCell><Badge variant={t.isActive ? "default" : "destructive"}>{t.isActive ? "ACTIVE" : "INACTIVE"}</Badge></TableCell>
            <TableCell><Button variant="ghost" size="sm" onClick={() => deactivate(t)} disabled={busy === t.id || !t.isActive}><Power size={13} className="mr-1" />Deactivate</Button></TableCell>
          </TableRow>) : <TableRow><TableCell colSpan={7} className="p-8 text-center text-sm text-muted-foreground">No transporters registered yet</TableCell></TableRow>}</TableBody>
        </Table>
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Register a transporter</DialogTitle></DialogHeader>
          <form onSubmit={createTransporter} className="grid gap-3 md:grid-cols-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground md:col-span-2">Company details</p>
            <div className="space-y-1.5 md:col-span-2"><Label htmlFor="t-name">Company name</Label><Input id="t-name" name="companyName" required minLength={2} /></div>
            <div className="space-y-1.5"><Label htmlFor="t-reg">Registration no. (optional)</Label><Input id="t-reg" name="registrationNo" /></div>
            <div className="space-y-1.5"><Label htmlFor="t-cphone">Contact phone (optional)</Label><Input id="t-cphone" name="contactPhone" /></div>
            <div className="space-y-1.5 md:col-span-2"><Label htmlFor="t-cemail">Contact email (optional)</Label><Input id="t-cemail" name="contactEmail" type="email" /></div>
            <p className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground md:col-span-2">Primary login</p>
            <div className="space-y-1.5"><Label htmlFor="t-firstName">First name</Label><Input id="t-firstName" name="firstName" required minLength={2} /></div>
            <div className="space-y-1.5"><Label htmlFor="t-lastName">Last name</Label><Input id="t-lastName" name="lastName" required minLength={2} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label htmlFor="t-email">Login email</Label><Input id="t-email" name="email" type="email" required /></div>
            <div className="space-y-1.5 md:col-span-2"><Label htmlFor="t-password">Initial password</Label><Input id="t-password" name="password" type="password" required minLength={12} placeholder="At least 12 characters" /></div>
            <div className="space-y-1.5 md:col-span-2"><Label htmlFor="t-phone">Phone (optional)</Label><Input id="t-phone" name="phone" /></div>
            <p className="text-2xs text-muted-foreground md:col-span-2">This creates the company and its first dashboard login. Additional logins for the same company can be added from Users. Most transporters should apply themselves at /apply instead — use this only for manual onboarding.</p>
            <div className="md:col-span-2"><Button type="submit" disabled={busy === "create"} className="w-full">{busy === "create" ? "Registering…" : "Register transporter"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  </div>;
}
