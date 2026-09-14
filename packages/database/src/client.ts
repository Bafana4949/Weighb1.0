import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var _prismaDbUrl: string | undefined;
}

const currentUrl = process.env.DATABASE_URL;

if (globalThis.prisma && globalThis._prismaDbUrl && globalThis._prismaDbUrl !== currentUrl) {
  globalThis.prisma.$disconnect().catch(() => {});
  globalThis.prisma = undefined;
}

export const prisma = globalThis.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
  globalThis._prismaDbUrl = currentUrl;
}

export * from "@prisma/client";
