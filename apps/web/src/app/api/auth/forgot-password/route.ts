import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok,fail } from "@/lib/api";
import { hashValue } from "@/lib/crypto";
import { sendDirectEmail } from "@/lib/notifications";
import { rateLimitOrFail } from "@/lib/rate-limit";
const schema=z.object({email:z.string().email()});
const GENERIC_MESSAGE="If that email is registered, a reset link has been sent.";
export async function POST(request:Request){const limited=rateLimitOrFail(request,"forgot-password",5,60*60*1000);if(limited)return limited;const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail("A valid email is required",422);const email=parsed.data.email.toLowerCase();const user=await prisma.user.findUnique({where:{email}});
  // Always respond identically whether or not the email exists, so this endpoint
  // can't be used to enumerate registered accounts.
  if(!user||user.status!=="ACTIVE"||user.deletedAt)return ok({message:GENERIC_MESSAGE});
  const token=randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({data:{userId:user.id,tokenHash:hashValue(token),expiresAt:new Date(Date.now()+60*60*1000)}});
  const link=`${process.env.NEXT_PUBLIC_APP_URL??"http://localhost:3000"}/reset-password?token=${token}`;
  await sendDirectEmail(user.email,"Reset your Weighbridge Control password",`Someone requested a password reset for this account. If this was you, set a new password here (valid for 1 hour):\n\n${link}\n\nIf you didn't request this, you can ignore this email.`);
  return ok({message:GENERIC_MESSAGE});
}
