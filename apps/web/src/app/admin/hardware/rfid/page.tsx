import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { RfidManagement } from "@/components/rfid-management";

export default async function RfidManagementPage() {
  const s = await auth();
  if (!s?.user) redirect("/login");
  if (!isPlatformSuperAdmin(s.user)) redirect("/admin");

  const rawRows = await prisma.rfidCredential.findMany({
    include: {
      organisation: { select: { name: true } },
      driver: { select: { firstName: true, lastName: true } },
      vehicle: { select: { plate: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Map firstName and lastName to a single name field for the UI component
  const rows = rawRows.map(row => ({
    ...row,
    issuedAt: row.issuedAt.toISOString(),
    driver: row.driver ? {
      name: `${row.driver.firstName} ${row.driver.lastName}`.trim(),
    } : null,
  }));

  const orgs = await prisma.organisation.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const drivers = await prisma.driver.findMany({ select: { id: true, firstName: true, lastName: true, organisationId: true }, orderBy: { firstName: "asc" } });
  const vehicles = await prisma.vehicle.findMany({ select: { id: true, plate: true, organisationId: true }, orderBy: { plate: "asc" } });

  return (
    <AppShell role={s.user.role} userName={s.user.name ?? "Admin"} orgName={s.user.organisationName} isSuperAdmin={isPlatformSuperAdmin(s.user)}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">RFID Management</h1>
          <p className="text-xs text-muted-foreground">Manage and issue RFID cards or windshield tags for Drivers and Trucks.</p>
        </div>
        <RfidManagement initialCredentials={rows} organisations={orgs} drivers={drivers} vehicles={vehicles} />
      </div>
    </AppShell>
  );
}
