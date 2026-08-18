import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const roles = await prisma.role.count();
  const permissions = await prisma.permission.count();
  const builtIn = await prisma.role.count({ where: { isBuiltIn: true } });
  
  return NextResponse.json({ roles, permissions, builtIn });
}
