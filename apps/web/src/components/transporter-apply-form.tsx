"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TransporterApplyForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        companyName: form.get("companyName"), registrationNo: form.get("registrationNo") || null,
        contactEmail: form.get("contactEmail") || null, contactPhone: form.get("contactPhone") || null,
        firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"),
        password: form.get("password"), phone: form.get("phone") || null,
      };
      const response = await fetch("/api/transporters/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not submit application");
      setSubmitted(body.data.message);
    } catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }

  if (submitted) {
    return <div className="space-y-3">
      <p className="rounded-sm border border-success/30 bg-success/10 p-3 text-sm text-success">{submitted}</p>
      <p className="text-xs text-muted-foreground">You'll be able to sign in once an administrator approves your company.</p>
    </div>;
  }

  return <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground md:col-span-2">Company details</p>
    <div className="space-y-1.5 md:col-span-2"><Label htmlFor="a-name">Company name</Label><Input id="a-name" name="companyName" required minLength={2} /></div>
    <div className="space-y-1.5"><Label htmlFor="a-reg">Registration no. (optional)</Label><Input id="a-reg" name="registrationNo" /></div>
    <div className="space-y-1.5"><Label htmlFor="a-cphone">Contact phone (optional)</Label><Input id="a-cphone" name="contactPhone" /></div>
    <div className="space-y-1.5 md:col-span-2"><Label htmlFor="a-cemail">Contact email (optional)</Label><Input id="a-cemail" name="contactEmail" type="email" /></div>
    <p className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground md:col-span-2">Your login</p>
    <div className="space-y-1.5"><Label htmlFor="a-firstName">First name</Label><Input id="a-firstName" name="firstName" required minLength={2} /></div>
    <div className="space-y-1.5"><Label htmlFor="a-lastName">Last name</Label><Input id="a-lastName" name="lastName" required minLength={2} /></div>
    <div className="space-y-1.5 md:col-span-2"><Label htmlFor="a-email">Email</Label><Input id="a-email" name="email" type="email" required /></div>
    <div className="space-y-1.5 md:col-span-2"><Label htmlFor="a-password">Password</Label><Input id="a-password" name="password" type="password" required minLength={12} placeholder="At least 12 characters" /></div>
    <div className="space-y-1.5 md:col-span-2"><Label htmlFor="a-phone">Phone (optional)</Label><Input id="a-phone" name="phone" /></div>
    {error && <p className="rounded-sm border border-danger/30 bg-danger/10 p-2 text-xs text-danger md:col-span-2">{error}</p>}
    <div className="md:col-span-2"><Button type="submit" className="w-full" disabled={busy}>{busy ? "Submitting…" : "Submit application"}</Button></div>
  </form>;
}
