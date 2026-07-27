import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [Credentials({
    credentials: { email: {}, password: {} },
    async authorize(credentials) {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) return null;
      const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
      if (!user || user.status !== "ACTIVE" || user.deletedAt) return null;
      if (!await bcrypt.compare(parsed.data.password, user.passwordHash)) return null;
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      const organisation = user.organisationId ? await prisma.organisation.findUnique({ where: { id: user.organisationId } }) : null;
      return { id: user.id, email: user.email, name: `${user.firstName} ${user.lastName}`, role: user.role, organisationId: user.organisationId, organisationName: organisation?.name ?? null };
    },
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.organisationId = user.organisationId;
        token.organisationName = (user as { organisationName?: string | null }).organisationName ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id);
        session.user.role = token.role as UserRole;
        session.user.organisationId = (token.organisationId as string | null | undefined) ?? null;
        session.user.organisationName = (token.organisationName as string | null | undefined) ?? null;
      }
      return session;
    },
  },
});
