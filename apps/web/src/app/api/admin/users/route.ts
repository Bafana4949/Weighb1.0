import bcrypt from "bcryptjs";
import { UserRole,UserStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { mineScope } from "@/lib/access";
import { audit } from "@/lib/audit";
export async function GET(request:Request){const access=await requireRole([UserRole.ADMIN]);if(access.error)return access.error;const url=new URL(request.url);const role=url.searchParams.get("role") as UserRole|null;const status=url.searchParams.get("status") as UserStatus|null;const users=await prisma.user.findMany({where:{...(role?{role}:{}),...(status?{status}:{}),...mineScope(access.session!.user.organisationId)},include:{organisation:true},orderBy:{createdAt:"desc"}});return ok(users.map(({passwordHash,...user})=>user))}

const createSchema=z.object({email:z.string().email(),password:z.string().min(12),firstName:z.string().min(2),lastName:z.string().min(2),phone:z.string().optional().nullable(),role:z.nativeEnum(UserRole),organisationId:z.string().uuid().optional().nullable()});
export async function POST(request:Request){
  const access=await requireRole([UserRole.ADMIN]);if(access.error)return access.error;
  const parsed=createSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return fail(parsed.error.issues[0]?.message??"Invalid user",422);
  const callerOrg=access.session!.user.organisationId;
  if(callerOrg&&parsed.data.role==="TRANSPORTER")return fail("Transporter logins are created via Transporter onboarding, not here",422);
  const email=parsed.data.email.toLowerCase();
  if(await prisma.user.findUnique({where:{email}}))return fail("Email already registered",409);
  if(parsed.data.organisationId){
    const org=await prisma.organisation.findUnique({where:{id:parsed.data.organisationId}});
    if(!org||org.deletedAt)return fail("Organisation not found",422);
  }
  const {password,organisationId,...profile}=parsed.data;
  const finalOrgId=callerOrg??(organisationId??null);
  const user=await prisma.user.create({data:{...profile,email,organisationId:finalOrgId,passwordHash:await bcrypt.hash(password,12)}});
  await audit({userId:access.session!.user.id,action:"USER_CREATED",entityType:"user",entityId:user.id,afterData:{email:user.email,role:user.role,organisationId:user.organisationId}});
  const {passwordHash,...safe}=user;
  return ok(safe,201);
}
