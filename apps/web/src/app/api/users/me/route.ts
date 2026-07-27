import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";
const schema=z.object({firstName:z.string().min(2).optional(),lastName:z.string().min(2).optional(),phone:z.string().nullable().optional()});
export async function GET(){const s=await auth();if(!s?.user.id)return fail("Authentication required",401);const user=await prisma.user.findUnique({where:{id:s.user.id},select:{id:true,email:true,firstName:true,lastName:true,phone:true,role:true,status:true,organisation:true,lastLoginAt:true}});return ok(user)}
export async function PUT(request:Request){const s=await auth();if(!s?.user.id)return fail("Authentication required",401);const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail("Invalid profile data",422);const user=await prisma.user.update({where:{id:s.user.id},data:parsed.data,select:{id:true,email:true,firstName:true,lastName:true,phone:true,role:true}});return ok(user)}
