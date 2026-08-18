import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { logger } from "@/lib/logger";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "389a5165ecc5ef7bc47ebe02e382bdfe34e0d1ecd096f22626156282ad3ca136741ae1b2bdbb352efd0b00131cb2c8a0",
  providers: [Credentials({

    credentials: { email: {}, password: {} },
    async authorize(credentials) {
      try {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        
        const email = parsed.data.email.toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });
        
        if (!user || user.status !== "ACTIVE" || user.deletedAt) return null;
        
        const match = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!match) {
          logger.warn("auth_login_failed", { email, reason: "bad_password" }); 
          return null; 
        }
        
        logger.info("auth_login_succeeded", { user_id: user.id, email, role: user.role });
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        const organisation = user.organisationId ? await prisma.organisation.findUnique({ where: { id: user.organisationId } }) : null;
        
        return { id: user.id, email: user.email, name: `${user.firstName} ${user.lastName}`, role: user.role, organisationId: user.organisationId, organisationName: organisation?.name ?? null, platformRole: user.platformRole };
      } catch (err: any) {
        return null;
      }
    },
  })],
});
