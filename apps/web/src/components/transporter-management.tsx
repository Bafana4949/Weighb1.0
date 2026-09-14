"use client";
import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  KeyRound,
  Plus,
  Power,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
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
type TransporterRow = {
  id: string;
  name: string;
  registrationNo: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
  users: LoginUser[];
  _count: { vehicles: number; drivers: number };
};

export function TransporterManagement({ initialTransporters }: { initialTransporters: TransporterRow[] }) {
  const [transporters, setTransporters] = useState<TransporterRow[]>(initialTransporters);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal to display credentials to provide to the transporter
  const [provisioned, setProvisioned] = useState<{
    companyName: string;
    contactPerson: string;
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

  async function createTransporter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy("create");
    try {
      const companyName = String(form.get("companyName") || "").trim();
      const firstName = String(form.get("firstName") || "").trim();
      const lastName = String(form.get("lastName") || "").trim();
      const email = String(form.get("email") || "").trim().toLowerCase();
      const password = passwordValue || String(form.get("password") || "").trim();

      if (!password || password.length < 12) {
        throw new Error("Password must be at least 12 characters long.");
      }

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

      const response = await fetch("/api/admin/transporters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not register transporter");

      const created = body.data;
      setTransporters((current) => [{ ...created, _count: { vehicles: 0, drivers: 0 } }, ...current]);

      // Open credentials sharing dialog
      const origin = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com";
      setProvisioned({
        companyName,
        contactPerson: `${firstName} ${lastName}`,
        email,
        password,
        loginUrl: `${origin}/login`,
      });

      toast({ title: "Transporter registered successfully", body: `${created.name} · Login: ${email}` });
      formEl.reset();
      setPasswordValue("");
      setCreateOpen(false);
    } catch (error) {
      toast({ title: "Could not register transporter", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword(user: LoginUser) {
    const password = window.prompt(`New password for ${user.firstName} ${user.lastName} (at least 12 characters):`);
    if (!password) return;
    if (password.length < 12) {
      toast({ title: "Password not changed", body: "Password must be at least 12 characters", severity: "MEDIUM" });
      return;
    }
    setBusy(user.id);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/password`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not reset password");
      toast({ title: "Password reset", body: `${user.firstName} ${user.lastName}` });
    } catch (error) {
      toast({ title: "Could not reset password", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(null);
    }
  }

  async function deactivate(transporter: TransporterRow) {
    if (!window.confirm(`Deactivate ${transporter.name}? All of their logins will be suspended immediately.`)) return;
    setBusy(transporter.id);
    try {
      const response = await fetch(`/api/admin/transporters/${transporter.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not deactivate transporter");
      setTransporters((current) =>
        current.map((t) => (t.id === transporter.id ? { ...t, isActive: false } : t))
      );
      toast({ title: "Transporter deactivated", body: transporter.name });
    } catch (error) {
      toast({ title: "Could not deactivate transporter", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(null);
    }
  }

  async function activate(transporter: TransporterRow) {
    setBusy(transporter.id);
    try {
      const response = await fetch(`/api/admin/transporters/${transporter.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not activate transporter");
      setTransporters((current) =>
        current.map((t) => (t.id === transporter.id ? { ...t, isActive: true } : t))
      );
      toast({ title: "Transporter activated", body: transporter.name });
    } catch (error) {
      toast({ title: "Could not activate transporter", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(null);
    }
  }

  async function deleteTransporter(transporter: TransporterRow) {
    if (!window.confirm(`Permanently remove ${transporter.name}? This cannot be undone.`)) return;
    setBusy(transporter.id);
    try {
      const response = await fetch(`/api/admin/transporters/${transporter.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not delete transporter");
      setTransporters((current) => current.filter((t) => t.id !== transporter.id));
      toast({ title: "Transporter deleted", body: transporter.name });
    } catch (error) {
      toast({ title: "Could not delete transporter", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Registered Transporters</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Haulier companies authorised to haul cargo and create weighbridge bookings
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setPasswordValue("");
              generateRandomPassword();
              setCreateOpen(true);
            }}
            className="cursor-pointer gap-1.5"
          >
            <Plus size={14} />
            Register Transporter
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Registration</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Logins</TableHead>
                <TableHead>Fleet</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transporters.length ? (
                transporters.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <p className="flex items-center gap-1.5 font-medium">
                        <Building2 size={13} className="text-muted-foreground" />
                        {t.name}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{t.registrationNo ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {t.contactEmail ?? "—"}
                      <p className="text-2xs text-muted-foreground">{t.contactPhone ?? ""}</p>
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.users.map((u) => (
                        <p key={u.id} className="flex items-center gap-1.5">
                          {u.firstName} {u.lastName} ·{" "}
                          <span className="text-muted-foreground">{u.email}</span>{" "}
                          {u.status !== "ACTIVE" && <Badge variant="destructive">{u.status}</Badge>}
                          <button
                            type="button"
                            onClick={() => resetPassword(u)}
                            disabled={busy === u.id}
                            className="text-muted-foreground hover:text-foreground cursor-pointer"
                            title="Reset password"
                          >
                            <KeyRound size={12} />
                          </button>
                        </p>
                      ))}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t._count.vehicles} vehicles · {t._count.drivers} drivers
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.isActive ? "default" : "destructive"}>
                        {t.isActive ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-1">
                      {t.isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deactivate(t)}
                          disabled={busy === t.id}
                          className="cursor-pointer"
                        >
                          <Power size={13} className="mr-1" />
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => activate(t)}
                          disabled={busy === t.id}
                          className="cursor-pointer"
                        >
                          <CheckCircle2 size={13} className="mr-1" />
                          Activate
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        onClick={() => deleteTransporter(t)}
                        disabled={busy === t.id}
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
                    No transporters registered yet. Click &quot;Register Transporter&quot; to add a haulier company.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>

        {/* CREATE TRANSPORTER DIALOG */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Register a Transporter Company</DialogTitle>
              <DialogDescription>
                Authorise a haulage partner and provision login credentials for their fleet manager.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={createTransporter} className="grid gap-3 md:grid-cols-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground md:col-span-2">
                Company Details
              </p>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="t-name">Company Legal Name *</Label>
                <Input id="t-name" name="companyName" placeholder="e.g. Unitrans Freight (Pty) Ltd" required minLength={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-reg">Registration No. (Optional)</Label>
                <Input id="t-reg" name="registrationNo" placeholder="2020/123456/07" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-cphone">Dispatch Phone (Optional)</Label>
                <Input id="t-cphone" name="contactPhone" placeholder="+27 11 000 0000" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="t-cemail">Company Contact Email</Label>
                <Input id="t-cemail" name="contactEmail" type="email" placeholder="dispatch@unitrans.co.za" />
              </div>

              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:col-span-2">
                Transporter Fleet Manager Login
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="t-firstName">First Name *</Label>
                <Input id="t-firstName" name="firstName" placeholder="Sipho" required minLength={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-lastName">Last Name *</Label>
                <Input id="t-lastName" name="lastName" placeholder="Dlamini" required minLength={2} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="t-email">Login Email Address *</Label>
                <Input id="t-email" name="email" type="email" placeholder="sipho@unitrans.co.za" required />
              </div>

              {/* Password Generator Field */}
              <div className="space-y-1.5 md:col-span-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="t-password">Initial Password *</Label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="flex items-center gap-1 text-2xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    <Sparkles size={11} />
                    Generate Secure Password
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="t-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={passwordValue}
                    onChange={(e) => setPasswordValue(e.target.value)}
                    required
                    minLength={12}
                    placeholder="Min 12 characters"
                    className="font-mono pr-20"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-muted-foreground hover:text-foreground p-1 cursor-pointer"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    {passwordValue && (
                      <button
                        type="button"
                        onClick={() => copyText(passwordValue, "input-pwd")}
                        className="text-muted-foreground hover:text-foreground p-1 cursor-pointer"
                        title="Copy password"
                      >
                        {copiedKey === "input-pwd" ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="t-phone">Mobile Phone (Optional)</Label>
                <Input id="t-phone" name="phone" placeholder="+27 82 000 0000" />
              </div>

              <div className="pt-2 md:col-span-2">
                <Button type="submit" disabled={busy === "create"} className="w-full cursor-pointer">
                  {busy === "create" ? "Registering & Generating Credentials…" : "Register Transporter & Get Credentials"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* PROVISIONED CREDENTIALS SUCCESS MODAL */}
        <Dialog open={!!provisioned} onOpenChange={(open) => !open && setProvisioned(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-2">
                <CheckCircle2 size={28} />
              </div>
              <DialogTitle className="text-center text-xl font-bold">
                Transporter Registered & Credentials Ready
              </DialogTitle>
              <DialogDescription className="text-center text-xs">
                Copy and share these login credentials with the transporter so they can manage their fleet, bookings, and view waybills.
              </DialogDescription>
            </DialogHeader>

            {provisioned && (
              <div className="space-y-3 py-2">
                <div className="rounded-sm border border-border bg-muted/40 p-3 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">Transporter Company:</span>
                    <strong className="font-semibold text-foreground">{provisioned.companyName}</strong>
                  </div>

                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">Contact Person:</span>
                    <span className="font-medium text-foreground">{provisioned.contactPerson}</span>
                  </div>

                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">Login Email:</span>
                    <div className="flex items-center gap-1.5">
                      <code className="rounded bg-background px-2 py-0.5 font-mono font-medium text-foreground">
                        {provisioned.email}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyText(provisioned.email, "email")}
                        className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                        title="Copy email"
                      >
                        {copiedKey === "email" ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">Temporary Password:</span>
                    <div className="flex items-center gap-1.5">
                      <code className="rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 font-mono font-bold">
                        {provisioned.password}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyText(provisioned.password, "pwd")}
                        className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                        title="Copy password"
                      >
                        {copiedKey === "pwd" ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Login Portal URL:</span>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={provisioned.loginUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-2xs text-primary hover:underline flex items-center gap-1"
                      >
                        {provisioned.loginUrl}
                        <ExternalLink size={10} />
                      </a>
                      <button
                        type="button"
                        onClick={() => copyText(provisioned.loginUrl, "url")}
                        className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                        title="Copy URL"
                      >
                        {copiedKey === "url" ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Big Copy Button to copy formatted message */}
                <Button
                  onClick={() => {
                    const message = [
                      `Dear ${provisioned.contactPerson},`,
                      ``,
                      `Your transporter account for ${provisioned.companyName} has been activated on the Weighbridge System.`,
                      ``,
                      `Portal URL: ${provisioned.loginUrl}`,
                      `Email: ${provisioned.email}`,
                      `Temporary Password: ${provisioned.password}`,
                      ``,
                      `Please log in to manage your vehicles, drivers, bookings, and track waybills.`,
                    ].join("\n");
                    copyText(message, "all");
                  }}
                  className="w-full cursor-pointer gap-2 font-medium"
                >
                  {copiedKey === "all" ? (
                    <>
                      <Check size={16} className="text-emerald-400" />
                      Copied All Credentials to Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      Copy All Credentials to Share with Transporter
                    </>
                  )}
                </Button>

                <div className="flex justify-end pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setProvisioned(null)}
                    className="cursor-pointer text-xs"
                  >
                    Done / Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}
