import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mineScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { SourceManagement } from "@/components/source-management";

export default async function SourcesPage() {
  const s = await auth();
  if (!s?.user) redirect("/login");

  const scope = mineScope(s.user.organisationId);
  const sources = await prisma.source.findMany({
    where: scope,
    orderBy: { name: "asc" }
  });

  return (
    <AppShell role={s.user.role} userName={s.user.name ?? "Admin"} orgName={s.user.organisationName} isSuperAdmin={isPlatformSuperAdmin(s.user)}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Sources</h1>
          <p className="text-xs text-muted-foreground">Manage origin points for inbound and outbound orders.</p>
        </div>
        <SourceManagement initialSources={JSON.parse(JSON.stringify(sources))} />
      </div>
    </AppShell>
  );
}
