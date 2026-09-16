import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { userScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { DestinationManagement } from "@/components/destination-management";

export default async function DestinationsPage() {
  const s = await auth();
  if (!s?.user) redirect("/login");

  const scope = userScope(s.user);
  const destinations = await prisma.destination.findMany({
    where: scope,
    orderBy: { name: "asc" }
  });

  return (
    <AppShell role={s.user.role} userName={s.user.name ?? "Admin"} orgName={s.user.organisationName} isSuperAdmin={isPlatformSuperAdmin(s.user)}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Destinations</h1>
          <p className="text-xs text-muted-foreground">Manage destination points for inbound and outbound orders.</p>
        </div>
        <DestinationManagement initialDestinations={JSON.parse(JSON.stringify(destinations))} />
      </div>
    </AppShell>
  );
}
