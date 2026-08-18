import type { DefaultSession } from "next-auth";
import type { PlatformRole,UserRole } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: UserRole;
    organisationId: string | null;
    organisationName?: string | null;
    platformRole?: PlatformRole | null;
  }
  interface Session {
    user: DefaultSession["user"] & { id: string; role: UserRole; organisationId: string | null; organisationName: string | null; platformRole: PlatformRole | null };
  }
}

declare module "next-auth/jwt" {
  interface JWT { id: string; role: UserRole; organisationId: string | null; organisationName: string | null; platformRole: PlatformRole | null }
}
