import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Truck, ClipboardList, PackageSearch, Receipt } from "lucide-react";

export default async function TransporterReports() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <AppShell 
      role={session.user.role} 
      userName={session.user.name ?? "Transporter"} 
      orgName={session.user.organisationName} 
      isSuperAdmin={isPlatformSuperAdmin(session.user)}
    >
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reports & Data Exports</h1>
          <p className="text-xs text-muted-foreground">Download raw CSV data for your fleet's operations.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Master Fleet List</CardTitle>
              </div>
              <CardDescription>Export a complete list of your registered trucks, trailers, and drivers.</CardDescription>
            </CardHeader>
            <CardContent>
              <a href="/api/transporter/reports/fleet">
                <Button className="w-full sm:w-auto" variant="outline">
                  <Download className="mr-2 h-4 w-4" /> Download Fleet CSV
                </Button>
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Daily Roster History</CardTitle>
              </div>
              <CardDescription>Export your historical daily fleet rosters to see which trucks were available on which days.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full sm:w-auto" variant="outline">
                <a href="/api/transporter/reports/roster" download="roster-history.csv">
                  <Download className="mr-2 h-4 w-4" /> Download Roster CSV
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <PackageSearch className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Assigned Orders</CardTitle>
              </div>
              <CardDescription>Export raw data of all orders and bookings assigned to your fleet by clients.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full sm:w-auto" variant="outline">
                <a href="/api/transporter/reports/orders" download="assigned-orders.csv">
                  <Download className="mr-2 h-4 w-4" /> Download Orders CSV
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Transactions (Waybills)</CardTitle>
              </div>
              <CardDescription>Export raw weighbridge transactions including tonnages, timestamps, and waybill numbers.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full sm:w-auto" variant="outline">
                <a href="/api/transporter/reports/transactions" download="transporter-transactions.csv">
                  <Download className="mr-2 h-4 w-4" /> Download Transactions CSV
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
