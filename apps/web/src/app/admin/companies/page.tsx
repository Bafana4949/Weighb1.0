import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { CompanyManagement } from "@/components/company-management";
export default async function Companies(){const s=await auth();if(!s?.user)redirect("/login");if(!isPlatformSuperAdmin(s.user))redirect("/admin");const rows=await prisma.organisation.findMany({where:{type:"MINING_COMPANY",deletedAt:null},include:{users:{orderBy:{createdAt:"asc"}},_count:{select:{sites:true}}},orderBy:{name:"asc"}});const companies=rows.map(({users,...org})=>({...org,users:users.map(({passwordHash,...u})=>u)}));return <AppShell role={s.user.role} userName={s.user.name??"Admin"} orgName={s.user.organisationName} isSuperAdmin={isPlatformSuperAdmin(s.user)}><div className="space-y-4"><div><h1 className="text-2xl font-semibold text-foreground">Mining companies</h1><p className="text-xs text-muted-foreground">Register mining companies as separate tenants. Each one gets its own scoped administrator who only ever sees their own company's data.</p></div><CompanyManagement initialCompanies={JSON.parse(JSON.stringify(companies))}/></div></AppShell>}
