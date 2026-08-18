"use client";
import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/providers";

type Installation = {
  id: string;
  name: string;
  topology: string;
  maxCapacityKg: number;
  laneCount: number;
  organisation: { name: string };
  site: { name: string };
};

export function InstallationManagement({
  initialInstallations,
  organisations,
  sites,
}: {
  initialInstallations: Installation[];
  organisations: { id: string; name: string }[];
  sites: { id: string; name: string; organisationId: string }[];
}) {
  const [installations, setInstallations] = useState<Installation[]>(initialInstallations);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const toast = useToast();

  const filteredSites = useMemo(() => {
    if (!selectedOrgId) return [];
    return sites.filter(s => s.organisationId === selectedOrgId);
  }, [sites, selectedOrgId]);

  async function createInstallation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = {
      name: form.get("name"),
      topology: form.get("topology"),
      maxCapacityKg: parseInt(form.get("maxCapacityKg") as string, 10),
      laneCount: parseInt(form.get("laneCount") as string, 10),
      organisationId: form.get("organisationId"),
      siteId: form.get("siteId"),
    };

    setBusy(true);
    try {
      const response = await fetch("/api/admin/installations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create installation");
      
      setInstallations((current) => [body.data, ...current]);
      toast({ title: "Installation created", body: body.data.name });
      setCreateOpen(false);
    } catch (error) {
      toast({ title: "Could not create installation", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Weighbridge Installations</CardTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1.5" /> New Installation
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Topology</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Lanes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {installations.length ? (
              installations.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="text-xs">{i.organisation?.name}</TableCell>
                  <TableCell className="text-xs">{i.site?.name}</TableCell>
                  <TableCell className="font-semibold">{i.name}</TableCell>
                  <TableCell><Badge>{i.topology}</Badge></TableCell>
                  <TableCell>{(i.maxCapacityKg / 1000).toFixed(1)} t</TableCell>
                  <TableCell>{i.laneCount}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  No installations found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Installation</DialogTitle></DialogHeader>
          <form onSubmit={createInstallation} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="organisationId">Organisation</Label>
              <select 
                name="organisationId" 
                id="organisationId"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onChange={(e) => setSelectedOrgId(e.target.value)} 
                required
              >
                <option value="">Select organisation...</option>
                {organisations.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="siteId">Site</Label>
              <select 
                name="siteId" 
                id="siteId"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                required 
                disabled={!selectedOrgId || filteredSites.length === 0}
              >
                <option value="">Select site...</option>
                {filteredSites.map((site) => (
                  <option key={site.id} value={site.id}>{site.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name">Installation Name</Label>
              <Input id="name" name="name" required minLength={2} placeholder="Main Gate Weighbridge" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="topology">Topology</Label>
              <select 
                name="topology" 
                id="topology"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required 
                defaultValue="BIDIRECTIONAL_SINGLE"
              >
                <option value="BIDIRECTIONAL_SINGLE">Bidirectional Single Deck</option>
                <option value="DUAL_ENTRY_EXIT">Dual Entry/Exit Decks</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="maxCapacityKg">Max Capacity (kg)</Label>
                <Input id="maxCapacityKg" name="maxCapacityKg" type="number" required min={1000} max={150000} defaultValue={80000} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="laneCount">Lane Count</Label>
                <Input id="laneCount" name="laneCount" type="number" required min={1} max={10} defaultValue={1} />
              </div>
            </div>

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Creating…" : "Create Installation"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
