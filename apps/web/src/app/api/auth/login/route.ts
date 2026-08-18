import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";
import { rateLimitOrFail } from "@/lib/rate-limit";
const schema=z.object({email:z.string().email(),password:z.string().min(8)});
export async function POST(request:Request){const limited=rateLimitOrFail(request,"auth-login",10,15*60*1000);if(limited)return limited;const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail("Invalid credentials payload",422);const user=await prisma.user.findUnique({where:{email:parsed.data.email.toLowerCase()}});
console.log("LOGIN ATTEMPT:", parsed.data?.email, "USER FOUND:", !!user, "STATUS:", user?.status);
if(user) console.log("HASH MATCH:", await bcrypt.compare(parsed.data.password, user.passwordHash));
if(!user||user.status!=="ACTIVE"||!await bcrypt.compare(parsed.data.password,user.passwordHash))return fail("Invalid email or password",401);const secret=new TextEncoder().encode(process.env.AUTH_SECRET??"development-secret-change-before-production");const token=await new SignJWT({role:user.role,organisationId:user.organisationId}).setProtectedHeader({alg:"HS256"}).setSubject(user.id).setIssuedAt().setExpirationTime("8h").sign(secret);return ok({access_token:token,token_type:"Bearer",expires_in:28800,user:{id:user.id,email:user.email,role:user.role}})
}
