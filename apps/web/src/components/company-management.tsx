"use client";
import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Copy,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  PauseCircle,
  Plus,
  Power,
  Sparkles,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/providers";

type LoginUser = { id: string; firstName: string; lastName: string; email: string; status: string };
type CompanyStatus = "PENDING_SETUP" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
type CompanyRow = {
  id: string;
  name: string;
  registrationNo: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
  status: CompanyStatus;
  users: LoginUser[];
  _count: { sites: number };
};

const STATUS_BADGE: Record<CompanyStatus, "default" | "warning" | "destructive" | "muted"> = {
  ACTIVE: "default",
  PENDING_SETUP: "warning",
  SUSPENDED: "destructive",
  ARCHIVED: "muted",
};

export function CompanyManagement({ initialCompanies }: { initialCompanies: CompanyRow[] }) {
  const [companies, setCompanies] = useState<CompanyRow[]>(initialCompanies);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal to display credentials to provide to the client
  const [provisioned, setProvisioned] = useState<{
    companyName: string;
    adminName: string;
    email: string;
    password: string;
    loginUrl: string;
  } | null>(null);

  const toast = useToast();

  function generateRandomPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
    let pwd = "";
    for (let i = 0; i < 14; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPasswordValue(pwd);
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
    toast({ title: "Copied to clipboard", body: text });
  }

  async function createCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    try {
      const companyName = String(form.get("companyName") || "").trim();
      const firstName = String(form.get("firstName") || "").trim();
      const lastName = String(form.get("lastName") || "").trim();
      const email = String(form.get("email") || "").trim().toLowerCase();
      const password = passwordValue || String(form.get("password") || "").trim();

      const payload = {
        companyName,
        registrationNo: form.get("registrationNo") || null,
        contactEmail: form.get("contactEmail") || null,
        contactPhone: form.get("contactPhone") || null,
        firstName,
        lastName,
        email,
        password,
        phone: form.get("phone") || null,
      };

      const response = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not register company");

      setCompanies((current) => [{ ...body.data, _count: { sites: 0 } }, ...current]);
      formEl.reset();
      setPasswordValue("");
      setCreateOpen(false);

      // Open the credential sharing card
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setProvisioned({
        companyName,
        adminName: `${firstName} ${lastName}`,
        email,
        password,
        loginUrl: `${origin}/login`,
      });

      toast({
        title: "Client Registered Successfully",
        body: `${companyName} created. Ready to share credentials with the client.`,
      });
    } catch (error) {
      toast({ title: "Could not register company", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  async function activate(company: CompanyRow) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/companies/${company.id}/activate`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not activate company");
      setCompanies((current) =>
        current.map((c) => (c.id === company.id ? { ...c, status: "ACTIVE" } : c))
      );
      toast({ title: "Company activated", body: company.name });
    } catch (error) {
      toast({ title: "Could not activate company", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  async function suspend(company: CompanyRow) {
    const reason = window.prompt(`Reason for suspending ${company.name}? (visible to their admins)`);
    if (!reason) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/companies/${company.id}/suspend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not suspend company");
      setCompanies((current) =>
        current.map((c) => (c.id === company.id ? { ...c, status: "SUSPENDED" } : c))
      );
      toast({ title: "Company suspended", body: company.name });
    } catch (error) {
      toast({ title: "Could not suspend company", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  async function archive(company: CompanyRow) {
    if (!window.confirm(`Archive ${company.name}? This cannot be undone from this screen.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/companies/${company.id}/archive`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not archive company");
      setCompanies((current) =>
        current.map((c) => (c.id === company.id ? { ...c, status: "ARCHIVED" } : c))
      );
      toast({ title: "Company archived", body: company.name });
    } catch (error) {
      toast({ title: "Could not archive company", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteCompany(company: CompanyRow) {
    if (!window.confirm(`Delete ${company.name}? This will suspend all users and hide the company.`))
      return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/companies/${company.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not delete company");
      setCompanies((current) => current.filter((c) => c.id !== company.id));
      toast({ title: "Company deleted", body: company.name });
    } catch (error) {
      toast({ title: "Could not delete company", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  const formattedShareMessage = provisioned
    ? `---------------------------------------------
WEIGHBRIDGE PLATFORM - CLIENT ACCESS CREDENTIALS
---------------------------------------------
Client Name:     ${provisioned.companyName}
Administrator:   ${provisioned.adminName}
Role:            Client Administrator
Login URL:       ${provisioned.loginUrl}

Email:           ${provisioned.email}
Password:        ${provisioned.password}

Instructions:
1. Go to ${provisioned.loginUrl}
2. Enter your email and password above.
3. Once logged in, you can set up your weighbridge sites, operators, and bookings.
---------------------------------------------`
    : "";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Mining Companies & Clients</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create client organisations and provision their Client Administrator credentials.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            generateRandomPassword();
            setCreateOpen(true);
          }}
        >
          <Plus size={14} className="mr-1.5" />
          Create Client
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client Company</TableHead>
              <TableHead>Registration</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Client Admin Logins</TableHead>
              <TableHead>Sites</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.length ? (
              companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="flex items-center gap-1.5 font-medium">
                      <Building2 size={13} className="text-muted-foreground" />
                      {c.name}
                    </p>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.registrationNo ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {c.contactEmail ?? "—"}
                    <p className="text-2xs text-muted-foreground">{c.contactPhone ?? ""}</p>
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.users.map((u) => (
                      <p key={u.id}>
                        {u.firstName} {u.lastName} ·{" "}
                        <span className="text-muted-foreground">{u.email}</span>{" "}
                        {u.status !== "ACTIVE" && <Badge variant="destructive">{u.status}</Badge>}
                      </p>
                    ))}
                  </TableCell>
                  <TableCell className="text-xs">{c._count.sites}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[c.status]}>{c.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="space-x-1">
                    {(c.status === "PENDING_SETUP" || c.status === "SUSPENDED") && (
                      <Button variant="ghost" size="sm" onClick={() => activate(c)} disabled={busy}>
                        <CheckCircle2 size={13} className="mr-1" />
                        Activate
                      </Button>
                    )}
                    {c.status === "ACTIVE" && (
                      <Button variant="ghost" size="sm" onClick={() => suspend(c)} disabled={busy}>
                        <PauseCircle size={13} className="mr-1" />
                        Suspend
                      </Button>
                    )}
                    {c.status !== "ARCHIVED" && (
                      <Button variant="ghost" size="sm" onClick={() => archive(c)} disabled={busy}>
                        <Power size={13} className="mr-1" />
                        Archive
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => deleteCompany(c)}
                      disabled={busy}
                    >
                      <Trash2 size={13} className="mr-1" />
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                  No mining companies or clients registered yet. Click &quot;Create Client&quot; above to add one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* CREATE CLIENT & PROVISION CREDENTIALS MODAL */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Register Client & Provision Admin Login</DialogTitle>
            <DialogDescription>
              Create the client company organisation and assign the initial Client Administrator credentials.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createCompany} className="grid gap-3 md:grid-cols-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground md:col-span-2">
              Client Company Details
            </p>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="c-name">Company / Organisation Name *</Label>
              <Input
                id="c-name"
                name="companyName"
                required
                minLength={2}
                placeholder="e.g. Anglo American Platinum or Seriti Mining"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-reg">Company Registration No.</Label>
              <Input id="c-reg" name="registrationNo" placeholder="e.g. 2024/123456/07" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-cphone">Contact Phone</Label>
              <Input id="c-cphone" name="contactPhone" placeholder="e.g. +27 11 000 0000" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="c-cemail">Contact Email</Label>
              <Input id="c-cemail" name="contactEmail" type="email" placeholder="e.g. info@client.co.za" />
            </div>

            <div className="mt-2 border-t border-border pt-3 md:col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Client Administrator Login Credentials
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generateRandomPassword}
                  className="h-7 text-xs"
                >
                  <Sparkles size={12} className="mr-1 text-amber-500" />
                  Generate Strong Password
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-firstName">Admin First Name *</Label>
              <Input id="c-firstName" name="firstName" required minLength={2} placeholder="e.g. John" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-lastName">Admin Last Name *</Label>
              <Input id="c-lastName" name="lastName" required minLength={2} placeholder="e.g. Khumalo" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="c-email">Admin Login Email *</Label>
              <Input
                id="c-email"
                name="email"
                type="email"
                required
                placeholder="e.g. j.khumalo@client.co.za"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="c-password">Admin Initial Password *</Label>
              <div className="relative">
                <Input
                  id="c-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={12}
                  value={passwordValue}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  placeholder="At least 12 characters"
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="c-phone">Admin Phone (optional)</Label>
              <Input id="c-phone" name="phone" placeholder="e.g. +27 82 000 0000" />
            </div>

            <p className="text-2xs text-muted-foreground md:col-span-2">
              The client admin will only ever access their own company&apos;s sites, bookings, weighments,
              reports and operators.
            </p>

            <div className="mt-2 md:col-span-2">
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Registering Client & Creating Credentials…" : "Create Client & Issue Credentials"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* CREDENTIALS PRESENTATION & SHARING MODAL */}
      <Dialog open={!!provisioned} onOpenChange={(open) => !open && setProvisioned(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Check size={18} />
              </div>
              <div>
                <DialogTitle>Client Created & Credentials Ready</DialogTitle>
                <DialogDescription>
                  Provide these credentials to the client administrator to grant them access.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {provisioned && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/40 p-4 space-y-2.5 text-sm">
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Organisation</span>
                  <span className="font-semibold text-foreground">{provisioned.companyName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Administrator</span>
                  <span className="font-medium text-foreground">{provisioned.adminName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Login URL</span>
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <span>{provisioned.loginUrl}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyText(provisioned.loginUrl, "url")}
                    >
                      {copiedKey === "url" ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Email</span>
                  <div className="flex items-center gap-1.5 font-mono text-xs font-medium text-primary">
                    <span>{provisioned.email}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyText(provisioned.email, "email")}
                    >
                      {copiedKey === "email" ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Password</span>
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold bg-background px-2 py-1 rounded border border-border">
                    <span>{provisioned.password}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyText(provisioned.password, "pwd")}
                    >
                      {copiedKey === "pwd" ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  variant="default"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={() => copyText(formattedShareMessage, "all")}
                >
                  {copiedKey === "all" ? (
                    <>
                      <Check size={16} className="text-emerald-300" />
                      All Credentials Copied to Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      Copy All Credentials to Share with Client
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setProvisioned(null)}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
