"use client";
import { useState } from "react";
import { Building2, CheckCircle2, PauseCircle, Plus, Power, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/providers";

type LoginUser = { id: string; firstName: string; lastName: string; email: string; status: string };
type CompanyStatus = "PENDING_SETUP" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
type CompanyRow = {
  id: string; name: string; registrationNo: string | null; contactEmail: string | null; contactPhone: string | null;
  isActive: boolean; status: CompanyStatus; users: LoginUser[]; _count: { sites: number };
};
const STATUS_BADGE: Record<CompanyStatus, "default" | "warning" | "destructive" | "muted"> = { ACTIVE: "default", PENDING_SETUP: "warning", SUSPENDED: "destructive", ARCHIVED: "muted" };

export function CompanyManagement({ initialCompanies }: { initialCompanies: CompanyRow[] }) {
  const [companies, setCompanies] = useState<CompanyRow[]>(initialCompanies);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function createCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const payload = {
        companyName: form.get("companyName"), registrationNo: form.get("registrationNo") || null,
        contactEmail: form.get("contactEmail") || null, contactPhone: form.get("contactPhone") || null,
        firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"),
        password: form.get("password"), phone: form.get("phone") || null,
      };
      const response = await fetch("/api/admin/companies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not register company");
      setCompanies((current) => [{ ...body.data, _count: { sites: 0 } }, ...current]);
      toast({ title: "Mining company registered", body: `${body.data.name} · admin login ${body.data.users[0]?.email} · pending setup — add a site, then activate` });
      formEl.reset();
      setCreateOpen(false);
    } catch (error) { toast({ title: "Could not register company", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function activate(company: CompanyRow) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/companies/${company.id}/activate`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not activate company");
      setCompanies((current) => current.map((c) => c.id === company.id ? { ...c, status: "ACTIVE" } : c));
      toast({ title: "Company activated", body: company.name });
    } catch (error) { toast({ title: "Could not activate company", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function suspend(company: CompanyRow) {
    const reason = window.prompt(`Reason for suspending ${company.name}? (visible to their admins)`);
    if (!reason) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/companies/${company.id}/suspend`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not suspend company");
      setCompanies((current) => current.map((c) => c.id === company.id ? { ...c, status: "SUSPENDED" } : c));
      toast({ title: "Company suspended", body: company.name });
    } catch (error) { toast({ title: "Could not suspend company", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function archive(company: CompanyRow) {
    if (!window.confirm(`Archive ${company.name}? This cannot be undone from this screen.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/companies/${company.id}/archive`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not archive company");
      setCompanies((current) => current.map((c) => c.id === company.id ? { ...c, status: "ARCHIVED" } : c));
      toast({ title: "Company archived", body: company.name });
    } catch (error) { toast({ title: "Could not archive company", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function deleteCompany(company: CompanyRow) {
    if (!window.confirm(`Delete ${company.name}? This will suspend all users and hide the company.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/companies/${company.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not delete company");
      setCompanies((current) => current.filter((c) => c.id !== company.id));
      toast({ title: "Company deleted", body: company.name });
    } catch (error) { toast({ title: "Could not delete company", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle>Mining companies</CardTitle>
      <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} className="mr-1.5" />New company</Button>
    </CardHeader>
    <CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Company</TableHead><TableHead>Registration</TableHead><TableHead>Contact</TableHead><TableHead>Admin logins</TableHead><TableHead>Sites</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
        <TableBody>{companies.length ? companies.map((c) => <TableRow key={c.id}>
          <TableCell><p className="flex items-center gap-1.5 font-medium"><Building2 size={13} className="text-muted-foreground" />{c.name}</p></TableCell>
          <TableCell className="font-mono text-xs">{c.registrationNo ?? "—"}</TableCell>
          <TableCell className="text-xs">{c.contactEmail ?? "—"}<p className="text-2xs text-muted-foreground">{c.contactPhone ?? ""}</p></TableCell>
          <TableCell className="text-xs">{c.users.map((u) => <p key={u.id}>{u.firstName} {u.lastName} · <span className="text-muted-foreground">{u.email}</span> {u.status !== "ACTIVE" && <Badge variant="destructive">{u.status}</Badge>}</p>)}</TableCell>
          <TableCell className="text-xs">{c._count.sites}</TableCell>
          <TableCell><Badge variant={STATUS_BADGE[c.status]}>{c.status.replace("_", " ")}</Badge></TableCell>
          <TableCell className="space-x-1">
            {(c.status === "PENDING_SETUP" || c.status === "SUSPENDED") && <Button variant="ghost" size="sm" onClick={() => activate(c)} disabled={busy}><CheckCircle2 size={13} className="mr-1" />Activate</Button>}
            {c.status === "ACTIVE" && <Button variant="ghost" size="sm" onClick={() => suspend(c)} disabled={busy}><PauseCircle size={13} className="mr-1" />Suspend</Button>}
            {c.status !== "ARCHIVED" && <Button variant="ghost" size="sm" onClick={() => archive(c)} disabled={busy}><Power size={13} className="mr-1" />Archive</Button>}
            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => deleteCompany(c)} disabled={busy}><Trash2 size={13} className="mr-1" />Delete</Button>
          </TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={7} className="p-8 text-center text-sm text-muted-foreground">No mining companies registered yet</TableCell></TableRow>}</TableBody>
      </Table>
    </CardContent>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Register a mining company</DialogTitle></DialogHeader>
        <form onSubmit={createCompany} className="grid gap-3 md:grid-cols-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground md:col-span-2">Company details</p>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="c-name">Company name</Label><Input id="c-name" name="companyName" required minLength={2} /></div>
          <div className="space-y-1.5"><Label htmlFor="c-reg">Registration no. (optional)</Label><Input id="c-reg" name="registrationNo" /></div>
          <div className="space-y-1.5"><Label htmlFor="c-cphone">Contact phone (optional)</Label><Input id="c-cphone" name="contactPhone" /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="c-cemail">Contact email (optional)</Label><Input id="c-cemail" name="contactEmail" type="email" /></div>
          <p className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground md:col-span-2">First administrator login</p>
          <div className="space-y-1.5"><Label htmlFor="c-firstName">First name</Label><Input id="c-firstName" name="firstName" required minLength={2} /></div>
          <div className="space-y-1.5"><Label htmlFor="c-lastName">Last name</Label><Input id="c-lastName" name="lastName" required minLength={2} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="c-email">Login email</Label><Input id="c-email" name="email" type="email" required /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="c-password">Initial password</Label><Input id="c-password" name="password" type="password" required minLength={12} placeholder="At least 12 characters" /></div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor="c-phone">Phone (optional)</Label><Input id="c-phone" name="phone" /></div>
          <p className="text-2xs text-muted-foreground md:col-span-2">This admin will only ever see this company's own sites, orders, bookings, staff and data — never another company's.</p>
          <div className="md:col-span-2"><Button type="submit" disabled={busy} className="w-full">{busy ? "Registering…" : "Register company"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </Card>;
}
