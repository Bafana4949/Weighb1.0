import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSION_CATALOGUE, BUILT_IN_ROLE_PERMISSIONS } from "@weighbridge/database/src/rbac-catalogue";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { RoleManagement } from "@/components/role-management";

export default async function Roles() {
  const s = await auth();
  if (!s?.user) redirect("/login");
  const isSuperAdmin = isPlatformSuperAdmin(s.user);

  // Auto-seed RBAC if missing
  if (await prisma.permission.count() === 0) {
    const permissionRows = await Promise.all(PERMISSION_CATALOGUE.map((p) => prisma.permission.create({ data: p })));
    const permissionByKey = new Map(permissionRows.map((p) => [p.key, p]));
    for (const [roleName, keys] of Object.entries(BUILT_IN_ROLE_PERMISSIONS)) {
      const grantedKeys = keys === null ? PERMISSION_CATALOGUE.map((p) => p.key) : keys;
      const role = await prisma.role.create({ data: { organisationId: null, name: roleName, isBuiltIn: true } });
      await prisma.rolePermission.createMany({ data: grantedKeys.map((key) => ({ roleId: role.id, permissionId: permissionByKey.get(key)!.id })) });
    }
  }

  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({
      where: isSuperAdmin ? undefined : { OR: [{ organisationId: null }, { organisationId: s.user.organisationId }] },
      include: { permissions: { include: { permission: true } }, _count: { select: { assignments: true } } },
      orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
    }),
    prisma.permission.findMany({ orderBy: [{ category: "asc" }, { key: "asc" }] }),
  ]);

  return <AppShell role={s.user.role} userName={s.user.name ?? "Admin"} orgName={s.user.organisationName} isSuperAdmin={isSuperAdmin}>
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold text-foreground">Roles and permissions</h1><p className="text-xs text-muted-foreground">Built-in roles apply everywhere. Custom roles are scoped to {isSuperAdmin ? "one client organisation" : "your organisation"}.</p></div>
      <RoleManagement initialRoles={JSON.parse(JSON.stringify(roles))} permissions={permissions} />
    </div>
  </AppShell>;
}
