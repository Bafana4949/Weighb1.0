import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hashValue } from "@/lib/crypto";
import { rateLimitOrFail } from "@/lib/rate-limit";

const schema = z.object({ token: z.string().min(32), password: z.string().min(8) });
const INVALID = "This reset link is invalid or has expired. Request a new one.";

export async function POST(request: Request) {
  const limited = rateLimitOrFail(request, "reset-password", 10, 60 * 60 * 1000);
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid reset request", 422);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashValue(parsed.data.token) }, include: { user: { select: { status: true, deletedAt: true, organisationId: true } } } });
  if (!record || record.usedAt || record.expiresAt < new Date()) return fail(INVALID, 422);
  // A suspended or deleted account cannot be reactivated through a reset link.
  if (record.user.status !== "ACTIVE" || record.user.deletedAt) return fail(INVALID, 422);
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await bcrypt.hash(parsed.data.password, 12) } }),
    // Using one link retires every outstanding link for the account.
    prisma.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } }),
  ]);
  await audit({ userId: record.userId, organisationId: record.user.organisationId, action: "USER_PASSWORD_RESET_SELF_SERVICE", entityType: "user", entityId: record.userId, ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null });
  return ok({ message: "Password updated. You can now sign in." });
}
