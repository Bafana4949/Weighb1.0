"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { HardwareDeviceType, OperatingTier } from "@prisma/client";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Copy, KeyRound, Loader2, Plus, Radio, RefreshCw, ShieldAlert, Trash2, Wrench, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CONNECTION_TYPES, DEVICE_CATEGORIES, DEVICE_TYPES, visibleFields, type ConnectionType, type FieldDef } from "@/lib/hardware-catalog";
import { CAPABILITIES, CAPABILITY_KEYS, TIERS, TIER_LABEL, TIER_SUMMARY, WORKFLOWS, WORKFLOW_LABEL, type CapabilityKey, type ReadinessIssue, type Workflow } from "@/lib/tiers";
import { STATUS_LABEL, type DeviceStatus } from "@/lib/hardware-health";
import { DeviceLiveTest } from "@/components/device-live-test";

type Company = { id: string; name: string; licensedTier: OperatingTier };
type SiteOption = {
  id: string; code: string; name: string; organisationId: string; isActive: boolean;
  lanes: { id: string; laneNumber: number; name: string }[];
  edgeKeyPrefix: string | null; edgeLastSeenAt: string | null; edgeVersion: string | null; edgePendingSync: number | null; edgeFailedSync: number | null; edgeMqttConnected: boolean | null; edgeSimulated: boolean | null; edgeStatus: string; edgeAge: string;
};
type Device = {
  id: string; type: HardwareDeviceType; deviceKey: string; name: string; laneId: string | null; connectionType: ConnectionType | null;
  manufacturer: string | null; model: string | null; serialNumber: string | null; firmwareVersion: string | null;
  configuration: Record<string, unknown> | null; isActive: boolean; isSimulated: boolean; maintenanceMode: boolean;
  status: DeviceStatus; lastMessage: string | null; lastTestedAt: string | null; lastTestResult: { overall?: string } | null;
};
type TierState = {
  tier: OperatingTier; licensedTier: OperatingTier; effectiveTier: OperatingTier; ready: boolean; issues: ReadinessIssue[];
  capabilities: Record<CapabilityKey, { availability: string; hardwarePresent: boolean; enabled: boolean }>;
  manualEntryPolicy: string; requireCardIdentification: boolean; overrides: { requireCardIdentification?: boolean; disabled?: CapabilityKey[] };
  allowedWorkflows: Workflow[]; highestSupportedTier: OperatingTier;
};
type Profile = { id: string; name: string; description?: string | null; tier: OperatingTier; builtIn: boolean };

export const STATUS_STYLE: Record<DeviceStatus, string> = {
  ONLINE: "border-success/30 bg-success/10 text-success",
  OFFLINE: "border-danger/30 bg-danger/10 text-danger",
  WARNING: "border-warning/30 bg-warning/10 text-warning",
  ERROR: "border-danger/30 bg-danger/10 text-danger",
  DISABLED: "border-border bg-muted text-muted-foreground",
  UNKNOWN: "border-border bg-muted text-muted-foreground",
  MAINTENANCE: "border-primary/30 bg-primary/10 text-primary",
};

export function StatusPill({ status }: { status: DeviceStatus }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide", STATUS_STYLE[status])}><span className="h-1.5 w-1.5 rounded-full bg-current" />{STATUS_LABEL[status]}</span>;
}

const SUPPORT_BADGE = { implemented: { label: "Adapter ready", variant: "default" as const }, edge: { label: "Via edge controller", variant: "info" as const }, planned: { label: "Adapter planned", variant: "warning" as const } };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body.data as T;
}

export function HardwareCenter({ companies, sites, isSuperAdmin, initialSiteId }: { companies: Company[]; sites: SiteOption[]; isSuperAdmin: boolean; initialSiteId?: string }) {
  const initialSite = sites.find((s) => s.id === initialSiteId) ?? sites[0];
  const [companyId, setCompanyId] = useState(initialSite?.organisationId ?? companies[0]?.id ?? "");
  const companySites = useMemo(() => sites.filter((s) => s.organisationId === companyId), [sites, companyId]);
  const [siteId, setSiteId] = useState(initialSite?.id ?? "");
  const site = sites.find((s) => s.id === siteId) ?? null;
  const [laneFilter, setLaneFilter] = useState<string>("ALL");
  const [devices, setDevices] = useState<Device[]>([]);
  const [tier, setTier] = useState<TierState | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const readOnly = !isSuperAdmin;

  const reload = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const [d, t] = await Promise.all([api<Device[]>(`/api/admin/hardware/devices?siteId=${siteId}`), api<TierState>(`/api/admin/sites/${siteId}/tier`)]);
      setDevices(d);
      setTier(t);
    } catch (e) {
      setNotice({ kind: "error", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { api<Profile[]>("/api/admin/hardware/profiles").then(setProfiles).catch(() => setProfiles([])); }, []);
  useEffect(() => {
    if (!companySites.some((s) => s.id === siteId)) setSiteId(companySites[0]?.id ?? "");
  }, [companySites, siteId]);

  const flash = (kind: "ok" | "error", text: string) => { setNotice({ kind, text }); if (kind === "ok") setTimeout(() => setNotice(null), 4000); };
  const visibleDevices = devices.filter((d) => laneFilter === "ALL" || (laneFilter === "SITE" ? !d.laneId : d.laneId === laneFilter));

  if (!companies.length || !sites.length) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No sites yet. Create a site with the <a className="text-primary underline" href="/admin/sites/new">site setup wizard</a> first.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <SelectField label="Company" value={companyId} onChange={setCompanyId} options={companies.map((c) => ({ value: c.id, label: c.name }))} disabled={companies.length < 2} />
        <SelectField label="Site" value={siteId} onChange={setSiteId} options={companySites.map((s) => ({ value: s.id, label: `${s.name} (${s.code})${s.isActive ? "" : " — inactive"}` }))} />
        <SelectField label="Weighbridge / lane" value={laneFilter} onChange={setLaneFilter} options={[{ value: "ALL", label: "All devices" }, { value: "SITE", label: "Site-wide devices" }, ...(site?.lanes ?? []).map((l) => ({ value: l.id, label: `Lane ${l.laneNumber} · ${l.name}` }))]} />
        <Button variant="outline" size="sm" className="md:mb-0.5" onClick={() => void reload()} disabled={loading}>{loading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}Refresh</Button>
      </div>

      {notice && <div role="status" className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", notice.kind === "ok" ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger")}>{notice.kind === "ok" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}<span>{notice.text}</span></div>}
      {readOnly && <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Read-only view. Hardware is configured by the platform administrator; contact support to change it.</div>}

      {site && tier && (
        <div className="grid gap-4 xl:grid-cols-3">
          <TierCard key={`${site.id}-tier`} siteId={site.id} state={tier} readOnly={readOnly} onSaved={(msg) => { flash("ok", msg); void reload(); }} onError={(m) => flash("error", m)} />
          <div className="space-y-4">
            <EdgeCard site={site} readOnly={readOnly} onError={(m) => flash("error", m)} onChanged={(m) => flash("ok", m)} />
            {!readOnly && <ProfileCard key={`${site.id}-${tier.tier}`} siteId={site.id} tier={tier.tier} profiles={profiles} onApplied={(m) => { flash("ok", m); void reload(); }} onError={(m) => flash("error", m)} />}
          </div>
        </div>
      )}

      {site && (
        <div className="space-y-4">
          {DEVICE_CATEGORIES.map((category) => {
            const types = (Object.keys(DEVICE_TYPES) as HardwareDeviceType[]).filter((t) => DEVICE_TYPES[t].category === category);
            return (
              <Card key={category}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{category}</CardTitle></CardHeader>
                <CardContent className="divide-y divide-border p-0">
                  {types.map((type) => (
                    <DeviceTypeRow key={type} type={type} site={site} devices={visibleDevices.filter((d) => d.type === type)} allDevices={devices} readOnly={readOnly}
                      defaultLaneId={laneFilter !== "ALL" && laneFilter !== "SITE" ? laneFilter : site.lanes[0]?.id ?? null}
                      onChanged={(m) => { flash("ok", m); void reload(); }} onError={(m) => flash("error", m)} />
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  const id = `sel-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm disabled:opacity-70">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function TierCard({ siteId, state, readOnly, onSaved, onError }: { siteId: string; state: TierState; readOnly: boolean; onSaved: (m: string) => void; onError: (m: string) => void }) {
  const [tier, setTier] = useState<OperatingTier>(state.tier);
  const [requireCard, setRequireCard] = useState(Boolean(state.overrides.requireCardIdentification));
  const [workflows, setWorkflows] = useState<Workflow[]>(state.allowedWorkflows);
  const [saving, setSaving] = useState(false);
  const dirty = tier !== state.tier || requireCard !== Boolean(state.overrides.requireCardIdentification) || workflows.join() !== state.allowedWorkflows.join();
  const blockers = state.issues.filter((i) => i.severity === "blocker");
  const warnings = state.issues.filter((i) => i.severity === "warning");

  async function save() {
    setSaving(true);
    try {
      await api(`/api/admin/sites/${siteId}/tier`, { method: "PUT", body: JSON.stringify({ operatingTier: tier, overrides: { ...state.overrides, requireCardIdentification: requireCard }, allowedWorkflows: workflows }) });
      onSaved(`Site set to ${TIER_LABEL[tier]}.`);
    } catch (e) { onError((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <Card className="xl:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">Operating tier</CardTitle>
          <div className="flex items-center gap-2 text-2xs text-muted-foreground">Licence: <Badge variant="info">{TIER_LABEL[state.licensedTier]}</Badge>{state.ready ? <Badge>Ready to operate</Badge> : <Badge variant="destructive">Not ready</Badge>}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="radiogroup" aria-label="Operating tier" className="grid gap-2 sm:grid-cols-3">
          {TIERS.map((t) => {
            const overLicence = TIERS.indexOf(t) > TIERS.indexOf(state.licensedTier);
            return (
              <button key={t} type="button" role="radio" aria-checked={tier === t} disabled={readOnly || overLicence} onClick={() => setTier(t)}
                className={cn("rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed", tier === t ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted", overLicence && "opacity-50")}>
                <p className="text-sm font-semibold">{TIER_LABEL[t]}</p>
                <p className="mt-1 text-xs text-muted-foreground">{TIER_SUMMARY[t]}</p>
                {overLicence && <p className="mt-1 text-2xs text-warning">Above company licence</p>}
              </button>
            );
          })}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITY_KEYS.map((key) => {
            const cap = state.capabilities[key];
            const tone = cap.enabled ? "text-success" : cap.availability === "unavailable" ? "text-muted-foreground/60" : cap.availability === "required" ? "text-danger" : "text-muted-foreground";
            const note = cap.enabled ? "Active" : cap.availability === "unavailable" ? "Not in this tier" : cap.availability === "required" ? "Required — hardware missing" : cap.availability === "included" ? "Recommended — no hardware" : "Optional";
            return <div key={key} className="flex items-start gap-2 rounded-sm border border-border px-2.5 py-2"><span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full bg-current", tone)} /><div><p className="text-xs font-medium">{CAPABILITIES[key].label}</p><p className={cn("text-2xs", tone)}>{note}</p></div></div>;
          })}
        </div>

        {(blockers.length > 0 || warnings.length > 0) && (
          <ul className="space-y-1">
            {blockers.map((i, n) => <li key={`b${n}`} className="flex gap-2 text-xs text-danger"><ShieldAlert size={14} className="mt-0.5 shrink-0" />{i.message}</li>)}
            {warnings.map((i, n) => <li key={`w${n}`} className="flex gap-2 text-xs text-warning"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{i.message}</li>)}
          </ul>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium">Permitted weighing workflows</legend>
            {WORKFLOWS.map((w) => (
              <label key={w} className="flex items-center gap-2 text-xs">
                <input type="checkbox" disabled={readOnly} checked={workflows.includes(w)} onChange={(e) => setWorkflows(e.target.checked ? [...workflows, w] : workflows.filter((x) => x !== w))} />
                {WORKFLOW_LABEL[w]}
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5 text-xs">
            <p className="font-medium">Operator rules at this tier</p>
            <p className="text-muted-foreground">Typed weights: {state.manualEntryPolicy === "PRIMARY" ? "normal method" : state.manualEntryPolicy === "REASON_REQUIRED" ? "backup only, reason required" : "emergency only, supervisor override"}.</p>
            {tier !== state.highestSupportedTier && <p className="text-muted-foreground">Installed hardware supports up to <strong>{TIER_LABEL[state.highestSupportedTier]}</strong>.</p>}
          </div>
        </div>

        {!readOnly && <div className="flex justify-end"><Button size="sm" disabled={!dirty || saving || workflows.length === 0} onClick={() => void save()}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Save tier settings</Button></div>}
      </CardContent>
    </Card>
  );
}

function EdgeCard({ site, readOnly, onError, onChanged }: { site: SiteOption; readOnly: boolean; onError: (m: string) => void; onChanged: (m: string) => void }) {
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefix, setPrefix] = useState(site.edgeKeyPrefix);
  useEffect(() => { setIssuedKey(null); setPrefix(site.edgeKeyPrefix); }, [site.id, site.edgeKeyPrefix]);
  const statusTone = site.edgeStatus === "ONLINE" ? "default" : site.edgeStatus === "OFFLINE" ? "destructive" : "muted";

  async function issue() {
    if (prefix && !window.confirm("Rotating the key disconnects the current edge controller until it is given the new key. Continue?")) return;
    setBusy(true);
    try { const r = await api<{ key: string; prefix: string }>(`/api/admin/sites/${site.id}/edge-key`, { method: "POST" }); setIssuedKey(r.key); setPrefix(r.prefix); onChanged("Edge key issued. Copy it now — it is shown only once."); }
    catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  async function revoke() {
    if (!window.confirm("Revoke the edge key? The site's edge controller will be locked out immediately.")) return;
    setBusy(true);
    try { await api(`/api/admin/sites/${site.id}/edge-key`, { method: "DELETE" }); setPrefix(null); setIssuedKey(null); onChanged("Edge key revoked."); }
    catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-sm">Edge controller</CardTitle><Badge variant={statusTone}>{site.edgeStatus.replace(/_/g, " ")}</Badge></div></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Last heartbeat</dt><dd>{site.edgeAge}</dd>
          <dt className="text-muted-foreground">Version</dt><dd>{site.edgeVersion ?? "—"}</dd>
          <dt className="text-muted-foreground">Pending offline sync</dt><dd>{site.edgePendingSync ?? "—"}</dd>
          <dt className="text-muted-foreground">Failed sync</dt><dd className={site.edgeFailedSync ? "text-danger" : ""}>{site.edgeFailedSync ?? "—"}</dd>
          <dt className="text-muted-foreground">MQTT</dt><dd>{site.edgeMqttConnected == null ? "—" : site.edgeMqttConnected ? "Connected" : "Disconnected"}</dd>
          <dt className="text-muted-foreground">Site key</dt><dd className="font-mono">{prefix ? `${prefix}…` : "Not issued"}</dd>
        </dl>
        {site.edgeSimulated && <p className="rounded-sm border border-warning/30 bg-warning/10 px-2 py-1 text-warning">Edge is running with SIMULATED hardware.</p>}
        {issuedKey && (
          <div className="space-y-1 rounded-md border border-warning/40 bg-warning/5 p-2">
            <p className="font-medium text-warning">Copy this key into the edge controller (WB_SITE_API_KEY). It will not be shown again.</p>
            <div className="flex gap-1"><code className="min-w-0 flex-1 break-all rounded-sm bg-muted px-1.5 py-1 font-mono text-2xs">{issuedKey}</code><Button size="icon" variant="outline" aria-label="Copy key" onClick={() => void navigator.clipboard?.writeText(issuedKey)}><Copy size={14} /></Button></div>
          </div>
        )}
        {!readOnly && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void issue()}><KeyRound size={14} className="mr-1.5" />{prefix ? "Rotate key" : "Issue key"}</Button>
            {prefix && <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => void revoke()}>Revoke</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileCard({ siteId, tier, profiles, onApplied, onError }: { siteId: string; tier: OperatingTier; profiles: Profile[]; onApplied: (m: string) => void; onError: (m: string) => void }) {
  // Default to the template that matches the site's tier.
  const preferred = profiles.find((p) => p.tier === tier) ?? profiles[0];
  const [profileId, setProfileId] = useState(preferred?.id ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!profileId && preferred) setProfileId(preferred.id); }, [preferred, profileId]);
  const selected = profiles.find((p) => p.id === profileId);
  async function apply() {
    setBusy(true);
    try {
      const r = await api<{ created: number; skipped: number; errors: string[] }>("/api/admin/hardware/profiles/apply", { method: "POST", body: JSON.stringify({ profileId, siteId }) });
      onApplied(`Template applied: ${r.created} device(s) added, ${r.skipped} already present.${r.errors.length ? ` Complete the highlighted settings on ${r.errors.length} device(s).` : ""}`);
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Hardware template</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <select aria-label="Hardware template" value={profileId} onChange={(e) => setProfileId(e.target.value)} className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm">
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} · {TIER_LABEL[p.tier]}{p.builtIn ? "" : " (saved)"}</option>)}
        </select>
        {selected?.description && <p className="text-xs text-muted-foreground">{selected.description}</p>}
        <p className="text-2xs text-muted-foreground">Adds missing devices only. Existing devices and their settings are kept.</p>
        <Button size="sm" variant="outline" disabled={!profileId || busy} onClick={() => void apply()}>{busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}Apply template</Button>
      </CardContent>
    </Card>
  );
}

function DeviceTypeRow({ type, site, devices, allDevices, readOnly, defaultLaneId, onChanged, onError }: {
  type: HardwareDeviceType; site: SiteOption; devices: Device[]; allDevices: Device[]; readOnly: boolean; defaultLaneId: string | null;
  onChanged: (m: string) => void; onError: (m: string) => void;
}) {
  const def = DEVICE_TYPES[type];
  const [adding, setAdding] = useState(false);
  const installed = devices.length > 0;
  const nextKey = () => {
    let n = allDevices.filter((d) => d.type === type).length + 1;
    let key = n === 1 ? def.keyPrefix : `${def.keyPrefix}_${n}`;
    while (allDevices.some((d) => d.deviceKey === key)) key = `${def.keyPrefix}_${++n}`;
    return key;
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <input type="checkbox" aria-label={`${def.label} installed`} className="mt-1" checked={installed || adding} disabled={readOnly || installed}
          onChange={(e) => setAdding(e.target.checked)} title={installed ? "Remove individual devices below" : "Add this device"} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{def.label}</p>
            {devices.map((d) => <StatusPill key={d.id} status={d.status} />)}
          </div>
          <p className="text-xs text-muted-foreground">{def.description}</p>
        </div>
        {installed && !readOnly && !adding && <Button size="sm" variant="ghost" onClick={() => setAdding(true)}><Plus size={14} className="mr-1" />Add another</Button>}
      </div>
      {(installed || adding) && (
        <div className="mt-3 space-y-2 pl-7">
          {devices.map((d) => <DeviceEditor key={d.id} device={d} site={site} readOnly={readOnly} onChanged={onChanged} onError={onError} />)}
          {adding && (
            <DeviceEditor site={site} readOnly={false} onChanged={(m) => { setAdding(false); onChanged(m); }} onError={onError} onCancel={() => setAdding(false)}
              device={{ id: "", type, deviceKey: nextKey(), name: def.label, laneId: defaultLaneId, connectionType: def.defaultConnection, manufacturer: null, model: null, serialNumber: null, firmwareVersion: null, configuration: {}, isActive: true, isSimulated: false, maintenanceMode: false, status: "UNKNOWN", lastMessage: null, lastTestedAt: null, lastTestResult: null }} />
          )}
        </div>
      )}
    </div>
  );
}

function DeviceEditor({ device, site, readOnly, onChanged, onError, onCancel }: { device: Device; site: SiteOption; readOnly: boolean; onChanged: (m: string) => void; onError: (m: string) => void; onCancel?: () => void }) {
  const isNew = !device.id;
  const [open, setOpen] = useState(isNew);
  const [form, setForm] = useState(() => ({
    name: device.name, deviceKey: device.deviceKey, laneId: device.laneId ?? "", connectionType: (device.connectionType ?? DEVICE_TYPES[device.type].defaultConnection) as ConnectionType,
    manufacturer: device.manufacturer ?? "", model: device.model ?? "", serialNumber: device.serialNumber ?? "",
    isActive: device.isActive, isSimulated: device.isSimulated, maintenanceMode: device.maintenanceMode,
    configuration: Object.fromEntries(Object.entries(device.configuration ?? {}).map(([k, v]) => [k, v])) as Record<string, unknown>,
  }));
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ overall: string; configuration: { messages: string[] }; liveStatus: { status: DeviceStatus; lastSeen: string } } | null>(null);
  const def = DEVICE_TYPES[device.type];
  const fields = visibleFields(device.type, form.connectionType);
  const support = CONNECTION_TYPES[form.connectionType].support;
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, configuration: { ...f.configuration, [k]: v } }));

  async function save() {
    setBusy(true);
    try {
      const configuration = Object.fromEntries(fields.map((f) => [f.key, form.configuration[f.key]]).filter(([, v]) => v !== undefined && v !== ""));
      const payload = { siteId: site.id, type: device.type, deviceKey: form.deviceKey.trim().toUpperCase(), name: form.name, laneId: form.laneId || null, connectionType: form.connectionType, manufacturer: form.manufacturer || null, model: form.model || null, serialNumber: form.serialNumber || null, configuration, isActive: form.isActive, isSimulated: form.isSimulated, maintenanceMode: form.maintenanceMode };
      await api(isNew ? "/api/admin/hardware/devices" : `/api/admin/hardware/devices/${device.id}`, { method: isNew ? "POST" : "PUT", body: JSON.stringify(payload) });
      onChanged(`${form.name} ${isNew ? "added" : "saved"}.`);
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Remove ${device.name}? Devices with history are retired rather than deleted.`)) return;
    setBusy(true);
    try { await api(`/api/admin/hardware/devices/${device.id}`, { method: "DELETE" }); onChanged(`${device.name} removed.`); }
    catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  async function submitTest(live?: unknown) {
    try { setTestResult(await api(`/api/admin/hardware/devices/${device.id}/test`, { method: "POST", body: JSON.stringify({ live }) })); }
    catch (e) { onError((e as Error).message); }
  }

  return (
    <div className={cn("rounded-md border", isNew ? "border-primary/40 bg-primary/5" : "border-border")}>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-sm font-medium">{form.name}</span>
        <span className="font-mono text-2xs text-muted-foreground">{form.deviceKey}</span>
        {!isNew && <StatusPill status={device.status} />}
        {form.isSimulated && <Badge variant="warning">Simulated</Badge>}
        <span className="ml-auto text-2xs text-muted-foreground">{CONNECTION_TYPES[form.connectionType].label}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextField label="Display name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} disabled={readOnly} />
            <TextField label="Device key" value={form.deviceKey} onChange={(v) => setForm({ ...form, deviceKey: v.toUpperCase() })} disabled={readOnly} mono />
            <div className="space-y-1"><Label className="text-xs">Lane</Label><select value={form.laneId} disabled={readOnly} onChange={(e) => setForm({ ...form, laneId: e.target.value })} className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"><option value="">Site-wide</option>{site.lanes.map((l) => <option key={l.id} value={l.id}>Lane {l.laneNumber} · {l.name}</option>)}</select></div>
            <div className="space-y-1"><Label className="text-xs">Connection</Label><select value={form.connectionType} disabled={readOnly} onChange={(e) => setForm({ ...form, connectionType: e.target.value as ConnectionType })} className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm">{def.connections.map((c) => <option key={c} value={c}>{CONNECTION_TYPES[c].label}{CONNECTION_TYPES[c].support === "planned" ? " (planned)" : ""}</option>)}</select></div>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground"><Badge variant={SUPPORT_BADGE[support].variant}>{SUPPORT_BADGE[support].label}</Badge>{CONNECTION_TYPES[form.connectionType].note}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextField label="Manufacturer" value={form.manufacturer} onChange={(v) => setForm({ ...form, manufacturer: v })} disabled={readOnly} />
            <TextField label="Model" value={form.model} onChange={(v) => setForm({ ...form, model: v })} disabled={readOnly} />
            <TextField label="Serial number" value={form.serialNumber} onChange={(v) => setForm({ ...form, serialNumber: v })} disabled={readOnly} />
          </div>
          {fields.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {fields.map((f) => <ConfigField key={f.key} field={f} value={form.configuration[f.key]} onChange={(v) => set(f.key, v)} disabled={readOnly} />)}
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.isActive} disabled={readOnly} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />Enabled</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.maintenanceMode} disabled={readOnly} onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })} /><Wrench size={12} />Maintenance</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.isSimulated} disabled={readOnly} onChange={(e) => setForm({ ...form, isSimulated: e.target.checked })} />Simulated device (test/demo only)</label>
          </div>
          {!isNew && (
            <div className="space-y-2 rounded-md bg-muted/40 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void submitTest()}><Radio size={14} className="mr-1.5" />Check configuration &amp; status</Button>
                <DeviceLiveTest device={{ type: device.type, connectionType: form.connectionType, configuration: form.configuration }} onResult={(live) => void submitTest(live)} />
                <span className="text-2xs text-muted-foreground">Tests are read-only: they never move gates or create transactions.</span>
              </div>
              {testResult && (
                <div className="text-xs">
                  <p className={cn("font-medium", testResult.overall === "pass" ? "text-success" : testResult.overall === "fail" ? "text-danger" : "text-warning")}>Result: {testResult.overall.toUpperCase()} · live status {STATUS_LABEL[testResult.liveStatus.status]} (last seen {testResult.liveStatus.lastSeen})</p>
                  <ul className="list-disc pl-4 text-muted-foreground">{testResult.configuration.messages.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
              )}
              {device.lastMessage && <p className="text-2xs text-muted-foreground">Last report: {device.lastMessage}</p>}
            </div>
          )}
          {!readOnly && (
            <div className="flex flex-wrap justify-end gap-2">
              {!isNew && <Button size="sm" variant="ghost" className="mr-auto text-danger" disabled={busy} onClick={() => void remove()}><Trash2 size={14} className="mr-1.5" />Remove</Button>}
              {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
              <Button size="sm" disabled={busy} onClick={() => void save()}>{busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}{isNew ? "Add device" : "Save device"}</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TextField({ label, value, onChange, disabled, mono }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; mono?: boolean }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cn("h-9", mono && "font-mono text-xs")} /></div>;
}

function ConfigField({ field, value, onChange, disabled }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  const label = <Label className="text-xs">{field.label}{field.required && <span className="text-danger"> *</span>}</Label>;
  const help = field.help ? <p className="text-2xs text-muted-foreground">{field.help}</p> : null;
  if (field.kind === "boolean") return <label className="flex items-center gap-2 self-end pb-2 text-xs"><input type="checkbox" checked={value === true || value === "true"} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />{field.label}</label>;
  if (field.kind === "select") return <div className="space-y-1">{label}<select value={value == null ? "" : String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"><option value="">—</option>{field.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>{help}</div>;
  return <div className="space-y-1">{label}<Input type={field.kind === "number" ? "number" : "text"} min={field.min} max={field.max} step="any" value={value == null ? "" : String(value)} disabled={disabled} onChange={(e) => onChange(field.kind === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)} className="h-9" />{help}</div>;
}
