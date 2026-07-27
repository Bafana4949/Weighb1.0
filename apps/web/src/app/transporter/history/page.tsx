import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow } from "@/components/ui/table";
import { formatKg } from "@/lib/utils";
export default async function History(){const s=await auth();if(!s?.user)redirect("/login");const rows=await prisma.weighbridgeTransaction.findMany({where:{booking:{transporterOrganisationId:s.user.organisationId??undefined}},include:{vehicle:true,site:true},orderBy:{capturedAt:"desc"},take:100});return <AppShell role={s.user.role} userName={s.user.name??"Transporter"}><Card><CardHeader><CardTitle>Waybill history</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Waybill</TableHead><TableHead>Captured</TableHead><TableHead>Vehicle</TableHead><TableHead>Site</TableHead><TableHead>Net weight</TableHead></TableRow></TableHeader><TableBody>{rows.map(x=><TableRow key={x.id}><TableCell><Link className="font-mono text-xs text-primary hover:underline" href={`/waybills/${x.id}`}>{x.waybillNumber}</Link></TableCell><TableCell className="font-mono text-xs">{x.capturedAt.toLocaleString("en-ZA")}</TableCell><TableCell>{x.vehicle.plate}</TableCell><TableCell>{x.site.code}</TableCell><TableCell className="font-mono">{formatKg(x.netWeightKg)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></AppShell>}
