import type { Prisma, PrismaClient } from "@prisma/client";

/** Short, unique, uppercase-alphanumeric organisation code used as the prefix for service-order ticket numbers. */
export async function generateOrgCode(tx: PrismaClient | Prisma.TransactionClient, name: string): Promise<string> {
  const base = (name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)) || "ORG";
  let code = base;
  let attempt = 1;
  while (await tx.organisation.findFirst({ where: { code } })) {
    code = `${base}${attempt}`;
    attempt++;
  }
  return code;
}
