"use client";
import { useRef, useState } from "react";
import { Paperclip, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const STATUSES = ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "WAITING_FOR_CLIENT", "RESOLVED", "CLOSED", "CANCELLED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
function selectClass() { return "h-9 w-full rounded-sm border border-border bg-surface px-3 text-sm"; }
function statusVariant(s: string) { return s === "OPEN" ? "destructive" : s === "RESOLVED" || s === "CLOSED" ? "default" : "warning"; }
function priorityVariant(p: string) { return p === "CRITICAL" ? "destructive" : p === "HIGH" ? "warning" : p === "MEDIUM" ? "info" : "muted"; }

type Order = {
  id: string; orderNumber: string; title: string; description: string; category: string; priority: string; status: string;
  createdAt: string; contactName: string | null; contactPhone: string | null; contactEmail: string | null; resolutionNotes: string | null;
  organisation: { name: string }; site: { name: string } | null; createdBy: { firstName: string; lastName: string }; assignedTo: { id: string; firstName: string; lastName: string } | null;
};
type Comment = { id: string; body: string; isInternal: boolean; createdAt: string; author: { firstName: string; lastName: string } };
type AssignableUser = { id: string; firstName: string; lastName: string };
type Attachment = { id: string; fileName: string; sizeBytes: number; createdAt: string; uploadedBy: { firstName: string; lastName: string } };

export function ServiceOrderDetail({ order, comments, attachments, assignableUsers, isSuperAdmin, canManage }: { order: Order; comments: Comment[]; attachments: Attachment[]; assignableUsers: AssignableUser[]; isSuperAdmin: boolean; canManage: boolean }) {
  const [current, setCurrent] = useState(order);
  const [thread, setThread] = useState(comments);
  const [files, setFiles] = useState(attachments);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function uploadFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast({ title: "File too large", body: "Maximum 10 MB", severity: "MEDIUM" }); return; }
    setBusy(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const response = await fetch(`/api/service-orders/${current.id}/attachments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/octet-stream", dataBase64 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not upload file");
      setFiles((f) => [body.data, ...f]);
      if (fileRef.current) fileRef.current.value = "";
      toast({ title: "File attached", body: file.name });
    } catch (error) { toast({ title: "Could not upload file", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function update(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch(`/api/service-orders/${current.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update service order");
      setCurrent((c) => ({ ...c, ...body.data }));
      toast({ title: "Service order updated", body: current.orderNumber });
    } catch (error) { toast({ title: "Could not update", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  async function postComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const body = String(form.get("body") ?? "").trim();
    if (!body) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/service-orders/${current.id}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body, isInternal: form.get("isInternal") === "on" }) });
      const respBody = await response.json();
      if (!response.ok) throw new Error(respBody.error ?? "Could not post comment");
      setThread((t) => [...t, respBody.data]);
      formEl.reset();
    } catch (error) { toast({ title: "Could not post comment", body: String(error), severity: "HIGH" }); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{current.orderNumber}</p>
        <h1 className="text-2xl font-semibold text-foreground">{current.title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{current.organisation.name}{current.site ? ` · ${current.site.name}` : ""} · opened by {current.createdBy.firstName} {current.createdBy.lastName} on {new Date(current.createdAt).toLocaleString("en-ZA")}</p>
      </div>
      <div className="flex gap-1.5">
        <Badge variant={priorityVariant(current.priority)}>{current.priority}</Badge>
        <Badge variant={statusVariant(current.status)}>{current.status.replace(/_/g, " ")}</Badge>
      </div>
    </div>

    <Card>
      <CardHeader><CardTitle>Details</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="whitespace-pre-wrap">{current.description}</p>
        <div className="grid gap-2 pt-2 text-xs text-muted-foreground md:grid-cols-3">
          <p>Category: <span className="text-foreground">{current.category.replace(/_/g, " ")}</span></p>
          {current.contactName && <p>Contact: <span className="text-foreground">{current.contactName}</span></p>}
          {current.contactPhone && <p>Phone: <span className="text-foreground">{current.contactPhone}</span></p>}
          {current.contactEmail && <p>Email: <span className="text-foreground">{current.contactEmail}</span></p>}
        </div>
      </CardContent>
    </Card>

    {canManage && <Card>
      <CardHeader><CardTitle>Manage</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <label className="block text-2xs uppercase tracking-wider text-muted-foreground">Status</label>
          <select className={selectClass()} value={current.status} disabled={busy} onChange={(e) => update({ status: e.target.value })}>{STATUSES.map((st) => <option key={st} value={st}>{st.replace(/_/g, " ")}</option>)}</select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-2xs uppercase tracking-wider text-muted-foreground">Priority</label>
          <select className={selectClass()} value={current.priority} disabled={busy} onChange={(e) => update({ priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-2xs uppercase tracking-wider text-muted-foreground">Assigned to</label>
          <select className={selectClass()} value={current.assignedTo?.id ?? ""} disabled={busy} onChange={(e) => update({ assignedToId: e.target.value || null })}>
            <option value="">Unassigned</option>
            {assignableUsers.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
        </div>
        {(current.status === "RESOLVED" || current.status === "CLOSED") && <div className="space-y-1.5 md:col-span-3">
          <label className="block text-2xs uppercase tracking-wider text-muted-foreground">Resolution notes</label>
          <textarea className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm" rows={2} defaultValue={current.resolutionNotes ?? ""} disabled={busy}
            onBlur={(e) => { if (e.target.value !== (current.resolutionNotes ?? "")) update({ resolutionNotes: e.target.value }); }} />
        </div>}
      </CardContent>
    </Card>}

    <Card>
      <CardHeader><CardTitle>Attachments</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {files.map((f) => <div key={f.id} className="flex items-center justify-between rounded-sm border border-border p-2 text-sm">
          <a href={`/api/service-orders/${current.id}/attachments/${f.id}`} className="flex items-center gap-1.5 text-primary hover:underline"><Paperclip size={13} />{f.fileName}</a>
          <span className="text-2xs text-muted-foreground">{(f.sizeBytes / 1024).toFixed(0)} KB · {f.uploadedBy.firstName} {f.uploadedBy.lastName}</span>
        </div>)}
        {!files.length && <p className="text-sm text-muted-foreground">No attachments yet</p>}
        <form onSubmit={uploadFile} className="flex items-center gap-2 border-t border-border pt-3">
          <input ref={fileRef} type="file" className="text-sm" required />
          <Button type="submit" size="sm" disabled={busy}><Upload size={13} className="mr-1" />Upload</Button>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {thread.map((c) => <div key={c.id} className="rounded-sm border border-border p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{c.author.firstName} {c.author.lastName}{c.isInternal && <Badge variant="muted" className="ml-2">Internal</Badge>}</span><span>{new Date(c.createdAt).toLocaleString("en-ZA")}</span></div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
        </div>)}
        {!thread.length && <p className="p-4 text-center text-sm text-muted-foreground">No activity yet</p>}
        <form onSubmit={postComment} className="space-y-2 border-t border-border pt-3">
          <textarea name="body" required minLength={1} rows={3} placeholder="Add a comment…" className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm" />
          <div className="flex items-center justify-between">
            {isSuperAdmin && <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" name="isInternal" />Internal note (platform staff only)</label>}
            <Button type="submit" size="sm" disabled={busy}>Post comment</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>;
}
