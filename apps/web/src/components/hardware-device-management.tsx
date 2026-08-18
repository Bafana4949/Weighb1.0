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

type HardwareDevice = {
  id: string;
  name: string;
  deviceKey: string;
  type: string;
  isActive: boolean;
  serialNumber: string | null;
  firmwareVersion: string | null;
  site: { name: string; organisation: { name: string } };
  lane: { name: string } | null;
};

export function HardwareDeviceManagement({
  initialDevices,
  organisations,
  sites,
  lanes,
}: {
  initialDevices: HardwareDevice[];
  organisations: { id: string; name: string }[];
  sites: { id: string; name: string; organisationId: string }[];
  lanes: { id: string; name: string; siteId: string }[];
}) {
  const [devices, setDevices] = useState<HardwareDevice[]>(initialDevices);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  
  const toast = useToast();

  const filteredSites = useMemo(() => {
    if (!selectedOrgId) return [];
    return sites.filter((s) => s.organisationId === selectedOrgId);
  }, [sites, selectedOrgId]);

  const filteredLanes = useMemo(() => {
    if (!selectedSiteId) return [];
    return lanes.filter((l) => l.siteId === selectedSiteId);
  }, [lanes, selectedSiteId]);

  // Reset site when org changes
  const handleOrgChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedOrgId(e.target.value);
    setSelectedSiteId("");
  };

  async function createDevice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = {
      name: form.get("name"),
      deviceKey: form.get("deviceKey"),
      type: form.get("type"),
      siteId: form.get("siteId"),
      laneId: form.get("laneId") || undefined,
      serialNumber: form.get("serialNumber") || undefined,
      firmwareVersion: form.get("firmwareVersion") || undefined,
    };

    setBusy(true);
    try {
      const response = await fetch("/api/admin/hardware/devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create device");
      
      setDevices((current) => [body.data, ...current]);
      toast({ title: "Device created", body: body.data.name });
      setCreateOpen(false);
      
      // Reset form state
      setSelectedOrgId("");
      setSelectedSiteId("");
    } catch (error) {
      toast({ title: "Could not create device", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Hardware Devices</CardTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1.5" /> Register Device
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client & Site</TableHead>
              <TableHead>Lane</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Device Key</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.length ? (
              devices.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="text-xs">
                    <div className="font-semibold">{d.site.name}</div>
                    <div className="text-muted-foreground">{d.site.organisation.name}</div>
                  </TableCell>
                  <TableCell className="text-xs">{d.lane?.name || <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="font-semibold text-xs">{d.name}</TableCell>
                  <TableCell><Badge variant="muted">{d.type}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{d.deviceKey}</TableCell>
                  <TableCell>
                    <Badge variant={d.isActive ? "default" : "destructive"}>
                      {d.isActive ? "ONLINE" : "OFFLINE"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  No hardware devices found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Register Hardware Device</DialogTitle></DialogHeader>
          <form onSubmit={createDevice} className="space-y-4">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="organisationId">Organisation</Label>
                <select 
                  name="organisationId" 
                  id="organisationId"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={selectedOrgId}
                  onChange={handleOrgChange} 
                  required
                >
                  <option value="">Select...</option>
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
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  required 
                  disabled={!selectedOrgId || filteredSites.length === 0}
                >
                  <option value="">Select...</option>
                  {filteredSites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="laneId">Lane (Optional)</Label>
              <select 
                name="laneId" 
                id="laneId"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                disabled={!selectedSiteId || filteredLanes.length === 0}
              >
                <option value="">Site-wide (No Lane)</option>
                {filteredLanes.map((lane) => (
                  <option key={lane.id} value={lane.id}>{lane.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="type">Device Type</Label>
              <select 
                name="type" 
                id="type"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required 
                defaultValue="ANPR_CAMERA"
              >
                <option value="SCALE">Weighbridge Scale</option>
                <option value="ANPR_CAMERA">LPR/ANPR Camera</option>
                <option value="POSITION_SENSOR">Positioning Beam</option>
                <option value="RFID_READER">RFID Reader</option>
                <option value="ENTRY_GATE">Boom Gate (Entry)</option>
                <option value="EXIT_GATE">Boom Gate (Exit)</option>
                <option value="TRAFFIC_LIGHT">Traffic Light</option>
                <option value="BUZZER">Alarm/Buzzer</option>
                <option value="PRINTER">Receipt Printer</option>
                <option value="EDGE_DAEMON">Edge Daemon Server</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Display Name</Label>
                <Input id="name" name="name" required minLength={2} placeholder="Entry Camera 1" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deviceKey">Device Key</Label>
                <Input id="deviceKey" name="deviceKey" required minLength={2} placeholder="CAM-01" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="serialNumber">Serial Number</Label>
                <Input id="serialNumber" name="serialNumber" placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="firmwareVersion">Firmware Ver</Label>
                <Input id="firmwareVersion" name="firmwareVersion" placeholder="Optional" />
              </div>
            </div>

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Registering…" : "Register Device"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
