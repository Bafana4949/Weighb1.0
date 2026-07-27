"use client";
import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/providers";

type IncidentRow = {
  id: string; type: string; severity: string; status: string; title: string; description: string;
  createdAt: string | Date; site: { name: string } | null; vehicle: { plate: string } | null; driver: { firstName: string; lastName: string } | null;
};

export function IncidentManagement({ initialIncidents }: { initialIncidents: IncidentRow[] }) {
  const [incidents, setIncidents] = useState<IncidentRow[]>(initialIncidents);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  async function resolve(incident: IncidentRow, dismissed: boolean) {
    const notes = window.prompt(`${dismissed ? "Dismissal" : "Resolution"} notes for "${incident.title}" (at least 10 characters):`);
    if (!notes || notes.trim().length < 10) { toast({ title: "Cancelled", body: "Notes of at least 10 characters are required", severity: "MEDIUM" }); return; }
    setBusy(incident.id);
    try {
      const response = await fetch(`/api/incidents/${incident.id}/resolve`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes: notes.trim(), dismissed }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update incident");
      setIncidents((current) => current.map((i) => i.id === incident.id ? { ...i, status: body.data.status } : i));
      toast({ title: dismissed ? "Incident dismissed" : "Incident resolved", body: incident.title });
    } catch (error) { toast({ title: "Could not update incident", body: String(error), severity: "HIGH" }); }
    finally { setBusy(null); }
  }

  return <Card>
    <CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Incident</TableHead><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Site</TableHead><TableHead>Vehicle / driver</TableHead><TableHead>Reported</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
        <TableBody>{incidents.length ? incidents.map((i) => <TableRow key={i.id}>
          <TableCell><p className="font-medium">{i.title}</p><p className="text-xs text-muted-foreground">{i.description}</p></TableCell>
          <TableCell className="text-xs">{i.type}</TableCell>
          <TableCell><Badge variant={i.severity === "CRITICAL" || i.severity === "HIGH" ? "destructive" : i.severity === "MEDIUM" ? "warning" : "default"}>{i.severity}</Badge></TableCell>
          <TableCell className="text-xs">{i.site?.name ?? "—"}</TableCell>
          <TableCell className="text-xs">{i.vehicle?.plate ?? "—"}{i.driver ? ` · ${i.driver.firstName} ${i.driver.lastName}` : ""}</TableCell>
          <TableCell className="text-2xs">{new Date(i.createdAt).toLocaleString("en-ZA")}</TableCell>
          <TableCell><Badge variant={i.status === "OPEN" ? "destructive" : i.status === "ACKNOWLEDGED" ? "warning" : "default"}>{i.status}</Badge></TableCell>
          <TableCell><div className="flex gap-1.5">
            {i.status !== "RESOLVED" && i.status !== "DISMISSED" ? <>
              <Button size="sm" disabled={busy === i.id} onClick={() => resolve(i, false)}><CheckCircle2 size={13} className="mr-1" />Resolve</Button>
              <Button size="sm" variant="ghost" disabled={busy === i.id} onClick={() => resolve(i, true)}><XCircle size={13} className="mr-1" />Dismiss</Button>
            </> : <span className="text-2xs text-muted-foreground">No action needed</span>}
          </div></TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={8} className="p-8 text-center text-sm text-muted-foreground">No incidents match these filters</TableCell></TableRow>}</TableBody>
      </Table>
    </CardContent>
  </Card>;
}
