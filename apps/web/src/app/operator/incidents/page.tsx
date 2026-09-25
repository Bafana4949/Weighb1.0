import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { userScope } from "@/lib/access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSADateTime } from "@/lib/datetime";

export default async function Incidents() {
  const s = await auth();
  if (!s?.user) redirect("/login");

  const rows = await prisma.incident.findMany({
    where: { site: userScope(s.user) },
    include: { site: true, vehicle: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AppShell role={s.user.role} userName={s.user.name ?? "Operator"} isSuperAdmin={isPlatformSuperAdmin(s.user)}>
      <Card>
        <CardHeader>
          <CardTitle>Incident register</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((x) => (
                <TableRow key={x.id}>
                  <TableCell className="font-mono text-xs">{formatSADateTime(x.createdAt)}</TableCell>
                  <TableCell>{x.site.code}</TableCell>
                  <TableCell>{x.type}</TableCell>
                  <TableCell>
                    <p>{x.title}</p>
                    <p className="max-w-xl text-xs text-muted-foreground">{x.description}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={x.severity === "HIGH" || x.severity === "CRITICAL" ? "destructive" : x.severity === "MEDIUM" ? "warning" : "muted"}>
                      {x.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={x.status === "RESOLVED" ? "default" : "warning"}>{x.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
