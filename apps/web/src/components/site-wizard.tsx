"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { OperatingTier } from "@prisma/client";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Loader2, Rocket, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TIERS, TIER_LABEL, TIER_SUMMARY, WORKFLOWS, WORKFLOW_LABEL, type Workflow } from "@/lib/tiers";
import { BUILT_IN_PROFILES } from "@/lib/hardware-profiles";

type Company = { id: string; name: string; licensedTier: OperatingTier; products: number; users: number };

const STEPS = ["Company", "Site", "Tier", "Weighbridges", "Hardware", "Workflows", "Review"] as const;

export function SiteWizard({ companies }: { companies: Company[] }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    organisationId: companies[0]?.id ?? "", name: "", code: "", type: "MINE", address: "", latitude: "", longitude: "",
    operatingTier: "MANUAL" as OperatingTier, topology: "BIDIRECTIONAL_SINGLE", laneCount: 1, operatingStart: "05:00", operatingEnd: "22:00",
    profileId: "builtin-manual" as string | null, allowedWorkflows: ["DISPATCH", "RECEIPT"] as Workflow[],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ site: { id: string; code: string; name: string }; hardware: { created: number; errors: string[] } } | null>(null);
  const [activation, setActivation] = useState<{ ok: boolean; text: string } | null>(null);
  const company = companies.find((c) => c.id === form.organisationId);
  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const profiles = useMemo(() => BUILT_IN_PROFILES.filter((p) => TIERS.indexOf(p.tier) <= TIERS.indexOf(form.operatingTier)), [form.operatingTier]);

  const stepError = (() => {
    if (step === 0 && !company) return "Choose a company";
    if (step === 1) {
      if (form.name.trim().length < 2) return "Enter the site name";
      if (!/^[A-Za-z0-9-]{2,20}$/.test(form.code)) return "Site code: 2–20 letters, digits or dashes";
      if (form.address.trim().length < 2) return "Enter the site address";
      if (form.latitude === "" || Number.isNaN(Number(form.latitude)) || Math.abs(Number(form.latitude)) > 90) return "Latitude must be between -90 and 90";
      if (form.longitude === "" || Number.isNaN(Number(form.longitude)) || Math.abs(Number(form.longitude)) > 180) return "Longitude must be between -180 and 180";
    }
    if (step === 2 && company && TIERS.indexOf(form.operatingTier) > TIERS.indexOf(company.licensedTier)) return "Tier is above the company's licence";
    if (step === 5 && form.allowedWorkflows.length === 0) return "Allow at least one workflow";
    return null;
  })();

  async function create() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/sites/wizard", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, code: form.code.toUpperCase(), latitude: Number(form.latitude), longitude: Number(form.longitude), profileId: form.profileId || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not create the site");
      setCreated(body.data);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function activate() {
    if (!created) return;
    setBusy(true);
    const res = await fetch(`/api/admin/sites/${created.site.id}/activate`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setActivation(res.ok ? { ok: true, text: "Site activated. Operators assigned to it can start weighing." } : { ok: false, text: body.error ?? "Activation failed" });
    setBusy(false);
  }

  if (created) {
    const checklist = [
      { label: "Site, lanes and tier created", done: true },
      { label: `Hardware template applied (${created.hardware.created} devices)`, done: created.hardware.created > 0 || form.profileId === null, href: `/admin/hardware?site=${created.site.code}`, action: "Configure devices" },
      { label: "Device addresses filled in and tested", done: created.hardware.errors.length === 0 && created.hardware.created > 0, href: `/admin/hardware?site=${created.site.code}`, action: "Open hardware centre" },
      { label: `Products for ${company?.name} (${company?.products ?? 0} configured)`, done: (company?.products ?? 0) > 0, href: "/admin/products", action: "Manage products" },
      { label: `Users and site access (${company?.users ?? 0} company users)`, done: (company?.users ?? 0) > 0, href: "/admin/users", action: "Manage users" },
      { label: "Roles and permissions reviewed", done: false, href: "/admin/roles", action: "Review roles" },
    ];
    return (
      <Card>
        <CardHeader><CardTitle>{created.site.name} <span className="font-mono text-sm text-muted-foreground">{created.site.code}</span> created (inactive)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-2">
            {checklist.map((c) => (
              <li key={c.label} className="flex flex-wrap items-center gap-2 text-sm">
                {c.done ? <CheckCircle2 size={16} className="text-success" /> : <Circle size={16} className="text-muted-foreground" />}
                <span className={cn(!c.done && "text-muted-foreground")}>{c.label}</span>
                {c.href && <Link href={c.href} className="text-xs text-primary underline">{c.action}</Link>}
              </li>
            ))}
          </ol>
          {created.hardware.errors.length > 0 && <p className="text-xs text-warning">{created.hardware.errors.length} device(s) need site-specific settings (addresses, ports) before they can be validated.</p>}
          {activation && <p className={cn("flex items-center gap-2 text-sm", activation.ok ? "text-success" : "text-danger")}>{activation.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{activation.text}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || activation?.ok} onClick={() => void activate()}>{busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Rocket size={14} className="mr-1.5" />}Validate &amp; activate site</Button>
            <Button variant="outline" asChild><Link href={`/admin/hardware?site=${created.site.code}`}>Go to hardware centre</Link></Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Setup steps">
        <ol className="flex gap-1 overflow-x-auto lg:flex-col">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" disabled={i > step} onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined}
                className={cn("flex w-full items-center gap-2 whitespace-nowrap rounded-sm px-3 py-2 text-left text-sm", i === step ? "bg-muted font-medium text-primary" : "text-muted-foreground", i < step && "text-foreground")}>
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-2xs", i < step ? "border-success bg-success text-success-foreground" : i === step ? "border-primary" : "border-border")}>{i < step ? <Check size={12} /> : i + 1}</span>{s}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <Card>
        <CardHeader><CardTitle>{STEPS[step]}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <div className="space-y-3">
              <Field label="Company"><select value={form.organisationId} onChange={(e) => update({ organisationId: e.target.value })} className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm">{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              {company && <p className="text-xs text-muted-foreground">Licensed up to <Badge variant="info">{TIER_LABEL[company.licensedTier]}</Badge>. New company? <Link className="text-primary underline" href="/admin/companies">Register it first</Link>.</p>}
            </div>
          )}
          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Site name"><Input value={form.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. North Pit Weighbridge" /></Field>
              <Field label="Site code"><Input value={form.code} onChange={(e) => update({ code: e.target.value.toUpperCase() })} className="font-mono" placeholder="e.g. NPW-01" /></Field>
              <Field label="Site type"><select value={form.type} onChange={(e) => update({ type: e.target.value })} className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm">{["MINE", "WEIGHBRIDGE", "DEPOT", "CUSTOMER_SITE"].map((t) => <option key={t} value={t}>{t.replace("_", " ").toLowerCase()}</option>)}</select></Field>
              <Field label="Address"><Input value={form.address} onChange={(e) => update({ address: e.target.value })} /></Field>
              <Field label="Latitude"><Input inputMode="decimal" value={form.latitude} onChange={(e) => update({ latitude: e.target.value })} /></Field>
              <Field label="Longitude"><Input inputMode="decimal" value={form.longitude} onChange={(e) => update({ longitude: e.target.value })} /></Field>
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-2 sm:grid-cols-3">
              {TIERS.map((t) => {
                const over = company ? TIERS.indexOf(t) > TIERS.indexOf(company.licensedTier) : false;
                return (
                  <button key={t} type="button" disabled={over} onClick={() => update({ operatingTier: t, profileId: BUILT_IN_PROFILES.find((p) => p.tier === t)?.id ?? null })}
                    className={cn("rounded-md border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50", form.operatingTier === t ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted")}>
                    <p className="text-sm font-semibold">{TIER_LABEL[t]}</p><p className="mt-1 text-xs text-muted-foreground">{TIER_SUMMARY[t]}</p>{over && <p className="mt-1 text-2xs text-warning">Above licence</p>}
                  </button>
                );
              })}
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Layout"><select value={form.topology} onChange={(e) => update({ topology: e.target.value })} className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"><option value="BIDIRECTIONAL_SINGLE">Bidirectional (in and out over the same deck)</option><option value="DUAL_ENTRY_EXIT">Separate entry and exit lanes</option></select></Field>
              <Field label="Number of weighbridge lanes"><Input type="number" min={1} max={8} value={form.laneCount} onChange={(e) => update({ laneCount: Math.min(8, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
              <Field label="Opens"><Input type="time" value={form.operatingStart} onChange={(e) => update({ operatingStart: e.target.value })} /></Field>
              <Field label="Closes"><Input type="time" value={form.operatingEnd} onChange={(e) => update({ operatingEnd: e.target.value })} /></Field>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-2">
              {[...profiles, null].map((p) => (
                <label key={p?.id ?? "none"} className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-3", form.profileId === (p?.id ?? null) ? "border-primary bg-primary/5" : "border-border")}>
                  <input type="radio" name="profile" className="mt-1" checked={form.profileId === (p?.id ?? null)} onChange={() => update({ profileId: p?.id ?? null })} />
                  <div><p className="text-sm font-medium">{p ? p.name : "No template — configure hardware later"}</p>{p && <p className="text-xs text-muted-foreground">{p.description} · {p.devices.length} devices</p>}</div>
                </label>
              ))}
              <p className="text-2xs text-muted-foreground">Templates add device rows with sensible defaults. Addresses and ports are filled in on the hardware centre.</p>
            </div>
          )}
          {step === 5 && (
            <fieldset className="space-y-2">
              <legend className="sr-only">Permitted workflows</legend>
              {WORKFLOWS.map((w) => (
                <label key={w} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allowedWorkflows.includes(w)} onChange={(e) => update({ allowedWorkflows: e.target.checked ? [...form.allowedWorkflows, w] : form.allowedWorkflows.filter((x) => x !== w) })} />{WORKFLOW_LABEL[w]}</label>
              ))}
            </fieldset>
          )}
          {step === 6 && (
            <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Company</dt><dd>{company?.name}</dd>
              <dt className="text-muted-foreground">Site</dt><dd>{form.name} <span className="font-mono text-xs">{form.code}</span></dd>
              <dt className="text-muted-foreground">Tier</dt><dd>{TIER_LABEL[form.operatingTier]}</dd>
              <dt className="text-muted-foreground">Lanes</dt><dd>{form.laneCount} · {form.topology === "DUAL_ENTRY_EXIT" ? "separate entry/exit" : "bidirectional"}</dd>
              <dt className="text-muted-foreground">Hours</dt><dd>{form.operatingStart}–{form.operatingEnd}</dd>
              <dt className="text-muted-foreground">Hardware</dt><dd>{BUILT_IN_PROFILES.find((p) => p.id === form.profileId)?.name ?? "None yet"}</dd>
              <dt className="text-muted-foreground">Workflows</dt><dd>{form.allowedWorkflows.map((w) => WORKFLOW_LABEL[w].split(":")[0]).join(", ")}</dd>
            </dl>
          )}
          {(stepError || error) && <p role="alert" className="text-sm text-danger">{error ?? stepError}</p>}
          <div className="flex justify-between">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={14} className="mr-1.5" />Back</Button>
            {step < STEPS.length - 1
              ? <Button disabled={Boolean(stepError)} onClick={() => setStep(step + 1)}>Next<ArrowRight size={14} className="ml-1.5" /></Button>
              : <Button disabled={busy} onClick={() => void create()}>{busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}Create site</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
