import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

type Stat = { label: string; value: string | number; variant?: "default" | "warning" | "destructive" };
type ClientRow = { id: string; name: string; status: string; trucksToday: number; tonnageTodayKg: number; openIncidents: number; sites: { id: string; name: string; code: string }[] };
type ActivityRow = { id: string; action: string; entityType: string; occurredAt: Date; userName: string | null };

export function PlatformDashboard({ stats, clients, activity }: { stats: Stat[]; clients: ClientRow[]; activity: ActivityRow[] }) {
  return <div className="space-y-4">
    <div><h1 className="text-2xl font-semibold text-foreground">Platform overview</h1><p className="text-xs text-muted-foreground">Cross-client performance, risk and hardware availability across the entire platform.</p></div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stats.map((s) => <Card key={s.label}><CardContent className="p-4"><p className="text-2xs uppercase tracking-wider text-muted-foreground">{s.label}</p><p className={`mt-1 font-mono text-2xl font-semibold ${s.variant === "destructive" ? "text-danger" : s.variant === "warning" ? "text-warning" : ""}`}>{s.value}</p></CardContent></Card>)}
    </div>

    <Card>
      <CardHeader><CardTitle>Client-by-client performance (today)</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Status</TableHead><TableHead>Trucks today</TableHead><TableHead>Tonnage today</TableHead><TableHead>Open incidents</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>{clients.length ? clients.map((c) => <TableRow key={c.id}>
            <TableCell className="font-medium">{c.name}</TableCell>
            <TableCell><Badge variant={c.status === "ACTIVE" ? "default" : c.status === "SUSPENDED" ? "destructive" : "muted"}>{c.status.replace("_", " ")}</Badge></TableCell>
            <TableCell className="font-mono">{c.trucksToday}</TableCell>
            <TableCell className="font-mono">{(c.tonnageTodayKg / 1000).toFixed(1)} t</TableCell>
            <TableCell>{c.openIncidents > 0 ? <Badge variant="warning">{c.openIncidents}</Badge> : "0"}</TableCell>
            <TableCell className="text-right">
              <div className="flex flex-col items-end gap-1">
                {c.sites.map(site => (
                  <Link key={site.id} href={`/operator?site=${site.code}`} target="_blank" className="text-xs text-primary underline">
                    Operator: {site.code}
                  </Link>
                ))}
                <Link href="/admin/companies" className="text-xs text-muted-foreground underline mt-1">Manage client</Link>
              </div>
            </TableCell>
          </TableRow>) : <TableRow><TableCell colSpan={6} className="p-8 text-center text-sm text-muted-foreground">No client organisations registered yet</TableCell></TableRow>}</TableBody>
        </Table>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Recent platform activity</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>By</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
          <TableBody>{activity.length ? activity.map((a) => <TableRow key={a.id}>
            <TableCell className="text-xs">{a.action.replace(/_/g, " ")}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{a.entityType}</TableCell>
            <TableCell className="text-xs">{a.userName ?? "System"}</TableCell>
            <TableCell className="text-2xs text-muted-foreground">{new Date(a.occurredAt).toLocaleString("en-ZA")}</TableCell>
          </TableRow>) : <TableRow><TableCell colSpan={4} className="p-8 text-center text-sm text-muted-foreground">No recent activity</TableCell></TableRow>}</TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>;
}
