import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok,requireRole } from "@/lib/api";
export async function GET(){const a=await requireRole([UserRole.ADMIN]);if(a.error)return a.error;const permissions=await prisma.permission.findMany({orderBy:[{category:"asc"},{key:"asc"}]});return ok(permissions)}
