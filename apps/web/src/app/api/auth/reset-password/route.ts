import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok,fail } from "@/lib/api";
import { hashValue } from "@/lib/crypto";
import { rateLimitOrFail } from "@/lib/rate-limit";
const schema=z.object({token:z.string().min(32),password:z.string().min(8)});
export async function POST(request:Request){const limited=rateLimitOrFail(request,"reset-password",10,60*60*1000);if(limited)return limited;const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail("Invalid reset request",422);const tokenHash=hashValue(parsed.data.token);const record=await prisma.passwordResetToken.findUnique({where:{tokenHash}});if(!record||record.usedAt||record.expiresAt<new Date())return fail("This reset link is invalid or has expired. Request a new one.",422);await prisma.$transaction([prisma.user.update({where:{id:record.userId},data:{passwordHash:await bcrypt.hash(parsed.data.password,12)}}),prisma.passwordResetToken.update({where:{id:record.id},data:{usedAt:new Date()}})]);return ok({message:"Password updated. You can now sign in."})}
