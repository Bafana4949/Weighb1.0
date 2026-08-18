import { UserRole } from "@prisma/client";
import { z } from "zod";
import { fail,ok,requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";
const schema=z.object({decision:z.enum(["ACCEPT","RELOAD"]),lane:z.string().optional()});
export async function POST(request:Request){const a=await requireRole([UserRole.OPERATOR,UserRole.ADMIN,UserRole.SECURITY]);if(a.error)return a.error;const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail("Invalid driver decision",422);try{const response=await fetch(`${process.env.SITE_DAEMON_URL??"http://localhost:8000"}/edge/driver-decision`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(parsed.data),signal:AbortSignal.timeout(3000)});const body=await response.json();if(!response.ok)throw new Error(body.detail??"daemon rejected driver decision");await audit({userId:a.session!.user.id,action:"DRIVER_LOAD_DECISION",entityType:"edge_hardware",afterData:parsed.data});return ok(body)}catch(error){return fail(`Site daemon unavailable: ${String(error)}`,503)}}
