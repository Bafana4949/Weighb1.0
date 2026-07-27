import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
});
