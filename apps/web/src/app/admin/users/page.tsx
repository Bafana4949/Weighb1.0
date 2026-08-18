import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mineScope } from "@/lib/access";
import { PERMISSION_CATALOGUE, BUILT_IN_ROLE_PERMISSIONS } from "@weighbridge/database/src/rbac-catalogue";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { UserManagement } from "@/components/user-management";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function Users({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const s = await auth(); if (!s?.user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 30;
  const scope = mineScope(s.user.organisationId);
  const where = { ...scope, ...(params.q ? { OR: [{ firstName: { contains: params.q, mode: "insensitive" as const } }, { lastName: { contains: params.q, mode: "insensitive" as const } }, { email: { contains: params.q, mode: "insensitive" as const } }] } : {}) };

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
  const [users, total, organisations, roles] = await Promise.all([
    prisma.user.findMany({ where, include: { organisation: true, roleAssignments: { include: { role: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.user.count({ where }),
    prisma.organisation.findMany({ where: { deletedAt: null, isActive: true, ...(s.user.organisationId ? { id: s.user.organisationId } : { type: { in: ["MINING_COMPANY"] } }) }, orderBy: { name: "asc" } }),
    prisma.role.findMany({ where: isPlatformSuperAdmin(s.user) ? undefined : { OR: [{ isBuiltIn: true }, { organisationId: s.user.organisationId }] }, orderBy: { name: "asc" } })
  ]);
  return <AppShell role={s.user.role} userName={s.user.name??"Admin"} orgName={s.user.organisationName} isSuperAdmin={isPlatformSuperAdmin(s.user)}><div className="space-y-4"><form className="flex items-end gap-2" method="get"><Input name="q" defaultValue={params.q ?? ""} placeholder="Search by name or email…" className="max-w-xs" /><Button type="submit" variant="secondary">Search</Button></form><UserManagement initialUsers={JSON.parse(JSON.stringify(users.map(({passwordHash,...u})=>u)))} organisations={organisations.map(o=>({id:o.id,name:o.name}))} roles={JSON.parse(JSON.stringify(roles))} currentUserId={s.user.id}/><PaginationControls page={page} limit={limit} total={total} basePath="/admin/users" params={{ q: params.q }} /></div></AppShell>;
}
