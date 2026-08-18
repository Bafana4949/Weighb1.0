"use client";
import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/providers";

type BookingRow = {
  id: string; reference: string; status: string; commodity: string; targetTonnageKg: number;
  windowStart: string | Date; windowEnd: string | Date;
  vehicle: { plate: string }; driver: { firstName: string; lastName: string; licenceNumber: string };
  site: { name: string; code: string }; transporterOrganisation: { name: string };
  order?: { orderNumber: string } | null;
};

export function BookingApprovals({ initialBookings }: { initialBookings: BookingRow[] }) {
  const [bookings, setBookings] = useState<BookingRow[]>(initialBookings);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  async function approve(booking: BookingRow, reason?: string) {
    setBusy(booking.id);
    try {
      const response = await fetch(`/api/bookings/${booking.id}/approve`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(reason ? { reason } : {}) });
      const body = await response.json();
      if (!response.ok) {
        if (!reason && /override reason is required/i.test(body.error ?? "")) {
          const override = window.confirm(`${body.error}\n\nDo you want to override the policy and approve anyway?`);
          if (override) return approve(booking, "Admin override");
          return;
        }
        throw new Error(body.error ?? "Could not approve booking");
      }
      setBookings((current) => current.map((b) => b.id === booking.id ? { ...b, status: body.data.status } : b));
      toast({ title: "Booking approved", body: `${booking.reference} · ${booking.vehicle.plate} can now use the weighbridge` });
    } catch (error) { toast({ title: "Could not approve booking", body: String(error), severity: "HIGH" }); }
    finally { setBusy(null); }
  }

  async function reject(booking: BookingRow) {
    if (!window.confirm(`Are you sure you want to reject booking ${booking.reference}?`)) return;
    setBusy(booking.id);
    try {
      const response = await fetch(`/api/bookings/${booking.id}/reject`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Rejected by admin" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not reject booking");
      setBookings((current) => current.filter((b) => b.id !== booking.id));
      toast({ title: "Booking rejected", body: `${booking.reference} · ${booking.vehicle.plate}` });
    } catch (error) { toast({ title: "Could not reject booking", body: String(error), severity: "HIGH" }); }
    finally { setBusy(null); }
  }

  const pending = bookings.filter((b) => b.status === "PENDING");
  const others = bookings.filter((b) => b.status !== "PENDING");

  return <div className="space-y-4">
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Awaiting approval</CardTitle>
        <Badge variant={pending.length ? "warning" : "default"}>{pending.length} pending</Badge>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Reference / Order</TableHead><TableHead>Transporter</TableHead><TableHead>Vehicle</TableHead><TableHead>Driver</TableHead><TableHead>Weighbridge</TableHead><TableHead>Product / load</TableHead><TableHead>Arrival window</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{pending.length ? pending.map((b) => <TableRow key={b.id}>
            <TableCell><div className="font-mono text-xs">{b.reference}</div>{b.order && <div className="text-2xs text-muted-foreground mt-1">Order: {b.order.orderNumber}</div>}</TableCell>
            <TableCell className="text-xs">{b.transporterOrganisation.name}</TableCell>
            <TableCell className="font-mono">{b.vehicle.plate}</TableCell>
            <TableCell className="text-xs">{b.driver.firstName} {b.driver.lastName}<p className="text-2xs text-muted-foreground">{b.driver.licenceNumber}</p></TableCell>
            <TableCell className="text-xs">{b.site.name}</TableCell>
            <TableCell className="text-xs">{b.commodity} · {(b.targetTonnageKg / 1000).toFixed(1)} t</TableCell>
            <TableCell className="text-2xs">{new Date(b.windowStart).toLocaleString("en-ZA")}<br /><span className="text-muted-foreground">to {new Date(b.windowEnd).toLocaleString("en-ZA")}</span></TableCell>
            <TableCell><div className="flex gap-1.5">
              <Button size="sm" disabled={busy === b.id} onClick={() => approve(b)}><CheckCircle2 size={13} className="mr-1" />Approve</Button>
              <Button size="sm" variant="destructive" disabled={busy === b.id} onClick={() => reject(b)}><XCircle size={13} className="mr-1" />Reject</Button>
            </div></TableCell>
          </TableRow>) : <TableRow><TableCell colSpan={8} className="p-8 text-center text-sm text-muted-foreground">No bookings waiting on approval</TableCell></TableRow>}</TableBody>
        </Table>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Recent decisions</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Reference / Order</TableHead><TableHead>Vehicle</TableHead><TableHead>Driver</TableHead><TableHead>Weighbridge</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{others.length ? others.map((b) => <TableRow key={b.id}>
            <TableCell><div className="font-mono text-xs">{b.reference}</div>{b.order && <div className="text-2xs text-muted-foreground mt-1">Order: {b.order.orderNumber}</div>}</TableCell>
            <TableCell className="font-mono">{b.vehicle.plate}</TableCell>
            <TableCell className="text-xs">{b.driver.firstName} {b.driver.lastName}</TableCell>
            <TableCell className="text-xs">{b.site.name}</TableCell>
            <TableCell><Badge variant={b.status === "APPROVED" || b.status === "ACTIVE" || b.status === "COMPLETED" ? "default" : "destructive"}>{b.status}</Badge></TableCell>
          </TableRow>) : <TableRow><TableCell colSpan={5} className="p-8 text-center text-sm text-muted-foreground">No other bookings yet</TableCell></TableRow>}</TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>;
}
