import type { NextAuthConfig } from "next-auth";
import type { PlatformRole,UserRole } from "@prisma/client";

/**
 * Edge-safe NextAuth config: no providers, no Prisma, no bcrypt. Middleware
 * runs in the Edge Runtime and has a hard bundle-size limit (Vercel: 1MB) —
 * importing the full auth.ts (Credentials provider needs bcrypt + Prisma's
 * Node engine) blew straight through that. This file only shapes the
 * session/jwt objects, which is pure and edge-safe, so middleware can use
 * it directly without dragging in the Node-only sign-in logic.
 */
export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.organisationId = user.organisationId;
        token.organisationName = (user as { organisationName?: string | null }).organisationName ?? null;
        token.platformRole = (user as { platformRole?: PlatformRole | null }).platformRole ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id);
        session.user.role = token.role as UserRole;
        session.user.organisationId = (token.organisationId as string | null | undefined) ?? null;
        session.user.organisationName = (token.organisationName as string | null | undefined) ?? null;
        session.user.platformRole = (token.platformRole as PlatformRole | null | undefined) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
