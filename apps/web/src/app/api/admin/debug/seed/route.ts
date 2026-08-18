import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PERMISSION_CATALOGUE } from "@weighbridge/database/src/rbac-catalogue";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { auth } from "@/auth";

export async function GET() {
  const s = await auth();
  if (!s?.user || !isPlatformSuperAdmin(s.user)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    let count = 0;
    for (const p of PERMISSION_CATALOGUE) {
      await prisma.permission.upsert({
        where: { key: p.key },
        update: { description: p.description, category: p.category },
        create: p,
      });
      count++;
    }
    return NextResponse.json({ success: true, seeded: count });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: String(error) });
  }
}
