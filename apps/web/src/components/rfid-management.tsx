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

type RfidCredential = {
  id: string;
  uid: string;
  displayCode: string | null;
  credentialType: string;
  status: string;
  organisation: { name: string };
  driver?: { name: string } | null;
  vehicle?: { plate: string } | null;
  issuedAt: string;
};

export function RfidManagement({
  initialCredentials,
  organisations,
  drivers,
  vehicles,
}: {
  initialCredentials: RfidCredential[];
  organisations: { id: string; name: string }[];
  drivers: { id: string; firstName: string; lastName: string; organisationId: string }[];
  vehicles: { id: string; plate: string; organisationId: string }[];
}) {
  const [credentials, setCredentials] = useState<RfidCredential[]>(initialCredentials);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("DRIVER");
  const toast = useToast();

  const filteredDrivers = useMemo(() => {
    if (!selectedOrgId) return [];
    return drivers.filter((d) => d.organisationId === selectedOrgId);
  }, [drivers, selectedOrgId]);

  const filteredVehicles = useMemo(() => {
    if (!selectedOrgId) return [];
    return vehicles.filter((v) => v.organisationId === selectedOrgId);
  }, [vehicles, selectedOrgId]);

  async function issueRfid(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = {
      uid: form.get("uid"),
      displayCode: form.get("displayCode") || undefined,
      credentialType: form.get("credentialType"),
      organisationId: form.get("organisationId"),
      driverId: form.get("credentialType") === "DRIVER" ? form.get("driverId") : undefined,
      vehicleId: form.get("credentialType") === "VEHICLE" ? form.get("vehicleId") : undefined,
    };

    setBusy(true);
    try {
      const response = await fetch("/api/admin/rfid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not issue RFID");
      
      const newCred = {
        ...body.data,
        driver: body.data.driver ? { name: `${body.data.driver.firstName} ${body.data.driver.lastName}`.trim() } : null,
      };

      setCredentials((current) => [newCred, ...current]);
      toast({ title: "RFID Issued", body: body.data.uid });
      setCreateOpen(false);
    } catch (error) {
      toast({ title: "Could not issue RFID", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>RFID Credentials</CardTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1.5" /> Issue New RFID
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>UID / Code</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Issued</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {credentials.length ? (
              credentials.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs">{c.organisation?.name}</TableCell>
                  <TableCell><Badge variant="default">{c.credentialType}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">
                    {c.uid}
                    {c.displayCode && <div className="text-muted-foreground">{c.displayCode}</div>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.credentialType === "DRIVER" ? c.driver?.name : c.vehicle?.plate}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.status === "ACTIVE" ? "default" : "destructive"}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{new Date(c.issuedAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  No RFID credentials found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Issue New RFID</DialogTitle></DialogHeader>
          <form onSubmit={issueRfid} className="space-y-4">
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
              <Label htmlFor="credentialType">Credential Type</Label>
              <select 
                name="credentialType" 
                id="credentialType"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedType} 
                onChange={(e) => setSelectedType(e.target.value)} 
                required
              >
                <option value="DRIVER">Driver ID Card</option>
                <option value="VEHICLE">Vehicle Windshield Tag</option>
              </select>
            </div>
            
            {selectedType === "DRIVER" && (
              <div className="space-y-1.5">
                <Label htmlFor="driverId">Driver</Label>
                <select 
                  name="driverId" 
                  id="driverId"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  required 
                  disabled={!selectedOrgId || filteredDrivers.length === 0}
                >
                  <option value="">Select driver...</option>
                  {filteredDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>{driver.firstName} {driver.lastName}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedType === "VEHICLE" && (
              <div className="space-y-1.5">
                <Label htmlFor="vehicleId">Vehicle</Label>
                <select 
                  name="vehicleId" 
                  id="vehicleId"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  required 
                  disabled={!selectedOrgId || filteredVehicles.length === 0}
                >
                  <option value="">Select vehicle...</option>
                  {filteredVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>{vehicle.plate}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="uid">Tag UID</Label>
                <Input id="uid" name="uid" required minLength={4} placeholder="E2000... (Hex)" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="displayCode">Display Code (Optional)</Label>
                <Input id="displayCode" name="displayCode" placeholder="Printed on tag" />
              </div>
            </div>

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Issuing…" : "Issue RFID"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
