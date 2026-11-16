import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
if (!authSecret && process.env.NODE_ENV === "production") {
  throw new Error("Missing AUTH_SECRET environment variable. Set AUTH_SECRET in your environment or Vercel settings.");
}
// A placeholder secret in production would make every session token forgeable.
if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build" && authSecret && /change-before-production|change-me|replace-with/i.test(authSecret)) {
  throw new Error("AUTH_SECRET is still a placeholder. Generate one with `openssl rand -base64 48`.");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  secret: authSecret,
  providers: [Credentials({

    credentials: { email: {}, password: {} },
    async authorize(credentials, request) {
      try {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase().trim();
        const emailKey = createHash("sha256").update(email).digest("hex").slice(0, 16);
        const ip = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        // Brute-force guard: per account and per source address. Failures and
        // successes both count, so the window also slows credential stuffing.
        const perAccount = checkRateLimit(`login:acct:${emailKey}`, 10, 15 * 60 * 1000);
        const perIp = checkRateLimit(`login:ip:${ip}`, 50, 15 * 60 * 1000);
        if (!perAccount.allowed || !perIp.allowed) {
          logger.warn("auth_login_rate_limited", { account: emailKey, ip });
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email }, include: { organisation: { select: { name: true, status: true } } } });
        if (!user || user.status !== "ACTIVE" || user.deletedAt) {
          logger.warn("auth_login_failed", { account: emailKey, reason: user ? "inactive" : "unknown_account" });
          return null;
        }
        if (user.organisation && (user.organisation.status === "SUSPENDED" || user.organisation.status === "ARCHIVED")) {
          logger.warn("auth_login_failed", { account: emailKey, reason: "organisation_suspended" });
          return null;
        }

        const match = await bcrypt.compare(parsed.data.password.trim(), user.passwordHash);
        if (!match) {
          logger.warn("auth_login_failed", { account: emailKey, reason: "bad_password" });
          return null;
        }

        logger.info("auth_login_succeeded", { user_id: user.id, role: user.role });
        prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => undefined);
        prisma.systemLog
          .create({ data: { userId: user.id, organisationId: user.organisationId, actorRole: user.platformRole ?? user.role, action: "LOGIN", entityType: "user", entityId: user.id, ipAddress: ip === "unknown" ? null : ip, userAgent: request?.headers?.get("user-agent") ?? null } })
          .catch(() => undefined);

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          organisationId: user.organisationId,
          organisationName: user.organisation?.name ?? null,
          platformRole: user.platformRole,
        };
      } catch (err: unknown) {
        logger.error("auth_authorize_exception", { message: err instanceof Error ? err.message : String(err) });
        return null;
      }
    },
  })],
});
