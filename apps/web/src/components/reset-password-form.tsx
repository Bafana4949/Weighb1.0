"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    const confirm = String(form.get("confirm"));
    if (password !== confirm) { setError("Passwords do not match"); setBusy(false); return; }
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not reset password");
      setDone(true);
      setTimeout(() => { router.push("/login"); }, 2000);
    } catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }

  if (done) return <p className="rounded-sm border border-success/30 bg-success/10 p-3 text-sm text-success">Password updated. Redirecting to sign in…</p>;

  return <form onSubmit={submit} className="space-y-4">
    <div className="space-y-1.5"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" required minLength={12} placeholder="At least 12 characters" /></div>
    <div className="space-y-1.5"><Label htmlFor="confirm">Confirm new password</Label><Input id="confirm" name="confirm" type="password" required minLength={12} /></div>
    {error && <p className="rounded-sm border border-danger/30 bg-danger/10 p-2 text-xs text-danger">{error}</p>}
    <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Set new password"}</Button>
  </form>;
}
