"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email") }) });
      const body = await response.json();
      setMessage(response.ok ? body.data.message : (body.error ?? "Something went wrong"));
    } catch { setMessage("Something went wrong. Try again."); }
    finally { setBusy(false); }
  }

  if (message) return <p className="rounded-sm border border-border bg-muted p-3 text-sm text-foreground">{message}</p>;

  return <form onSubmit={submit} className="space-y-4">
    <div className="space-y-1.5"><Label htmlFor="email">Email address</Label><Input id="email" name="email" type="email" required /></div>
    <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
  </form>;
}
