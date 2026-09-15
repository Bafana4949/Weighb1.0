import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformSuperAdmin } from "@/lib/api";
import { PERMISSION_CATALOGUE, BUILT_IN_ROLE_PERMISSIONS } from "@weighbridge/database/src/rbac-catalogue";

export async function GET() {
  const adminCheck = await requirePlatformSuperAdmin();
  if (adminCheck.error) return adminCheck.error;
  try {
    const existingPerms = await prisma.permission.count();
    let seeded = false;
    
    if (existingPerms === 0) {
      // 1. Seed Permissions
      const permissionRows = await Promise.all(
        PERMISSION_CATALOGUE.map((p) => prisma.permission.create({ data: p }))
      );
      const permissionByKey = new Map(permissionRows.map((p) => [p.key, p]));
      
      // 2. Seed Built-In Roles
      for (const [roleName, keys] of Object.entries(BUILT_IN_ROLE_PERMISSIONS)) {
        const grantedKeys = keys === null ? PERMISSION_CATALOGUE.map((p) => p.key) : keys;
        const role = await prisma.role.create({ data: { organisationId: null, name: roleName, isBuiltIn: true } });
        
        await prisma.rolePermission.createMany({ 
          data: grantedKeys.map((key) => ({ roleId: role.id, permissionId: permissionByKey.get(key)!.id })) 
        });
      }
      seeded = true;
    }
    
    const roleCount = await prisma.role.count();
    const permCount = await prisma.permission.count();
    
    return NextResponse.json({ success: true, seeded, roleCount, permCount });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
