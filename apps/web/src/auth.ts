import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { logger } from "@/lib/logger";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
if (!authSecret && process.env.NODE_ENV === "production") {
  throw new Error("Missing AUTH_SECRET environment variable. Set AUTH_SECRET in your environment or Vercel settings.");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  secret: authSecret,
  providers: [Credentials({

    credentials: { email: {}, password: {} },
    async authorize(credentials) {
      try {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          console.error("AUTH_FAILED: schema parse failed", parsed.error);
          return null;
        }
        
        const email = parsed.data.email.toLowerCase().trim();
        const user = await prisma.user.findUnique({ where: { email } });
        
        if (!user) {
          console.error("AUTH_FAILED: user not found for email", email);
          return null;
        }
        
        if (user.status !== "ACTIVE" || user.deletedAt) {
          console.error("AUTH_FAILED: user inactive or deleted", user.status, user.deletedAt);
          return null;
        }
        
        const inputPassword = parsed.data.password.trim();
        const match = await bcrypt.compare(inputPassword, user.passwordHash);
        if (!match) {
          console.error("AUTH_FAILED: bad password for", email);
          logger.warn("auth_login_failed", { email, reason: "bad_password" }); 
          return null; 
        }
        
        logger.info("auth_login_succeeded", { user_id: user.id, email, role: user.role });
        
        // Non-blocking update so a failure here doesn't abort login
        prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch((e) => console.warn("Failed to update lastLoginAt", e));
        
        let organisationName: string | null = null;
        if (user.organisationId) {
          try {
            const org = await prisma.organisation.findUnique({ where: { id: user.organisationId } });
            organisationName = org?.name ?? null;
          } catch (e) {
            console.warn("Failed to fetch organisation name:", e);
          }
        }
        
        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          organisationId: user.organisationId,
          organisationName,
          platformRole: user.platformRole,
        };
      } catch (err: any) {
        console.error("AUTH_AUTHORIZE_EXCEPTION:", err?.message || err);
        return null;
      }
    },
  })],
});
