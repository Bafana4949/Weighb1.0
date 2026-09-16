import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformSuperAdmin } from "@/lib/api";

export async function GET() {
  const adminCheck = await requirePlatformSuperAdmin();
  if (adminCheck.error) return adminCheck.error;
  const roles = await prisma.role.count();
  const permissions = await prisma.permission.count();
  const builtIn = await prisma.role.count({ where: { isBuiltIn: true } });
  
  return NextResponse.json({ roles, permissions, builtIn });
}
