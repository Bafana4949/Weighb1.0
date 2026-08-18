import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { DriverKiosk } from "@/components/driver-kiosk";
export default async function KioskPage(){const s=await auth();if(!s?.user)redirect("/login");if(!["OPERATOR","ADMIN","SECURITY"].includes(s.user.role))redirect("/login");const site=await prisma.site.findFirst({where:{isActive:true},orderBy:{code:"asc"}});if(!site)return <p>No active site configured.</p>;return <AppShell role={s.user.role} userName={s.user.name??"Operator"} isSuperAdmin={isPlatformSuperAdmin(s.user)}><DriverKiosk siteCode={site.code}/></AppShell>}
