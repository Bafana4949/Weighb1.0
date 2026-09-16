import bcrypt from "bcryptjs";
import { UserRole, UserStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole, withScopeErrors } from "@/lib/api";
import { userScope } from "@/lib/access";
import { audit } from "@/lib/audit";
import { rateLimitOrFail } from "@/lib/rate-limit";

export const GET = withScopeErrors(async function GET(request: Request) {
  const access = await requireRole([UserRole.ADMIN]);
  if (access.error) return access.error;
  const url = new URL(request.url);
  const role = url.searchParams.get("role") as UserRole | null;
  const status = url.searchParams.get("status") as UserStatus | null;
  const users = await prisma.user.findMany({
    where: {
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      ...userScope(access.session!.user),
    },
    include: { organisation: true, roleAssignments: { include: { role: true } } },
    orderBy: { createdAt: "desc" },
  });
  return ok(users.map(({ passwordHash, ...user }) => user));
});

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional().nullable(),
  role: z.nativeEnum(UserRole).default("OPERATOR"),
  organisationId: z.string().uuid().optional().nullable(),
  roleIds: z.array(z.string().uuid()).optional(),
});

export const POST = withScopeErrors(async function POST(request: Request) {
  const limited = rateLimitOrFail(request, "admin-users-create", 20, 10 * 60 * 1000);
  if (limited) return limited;
  const access = await requireRole([UserRole.ADMIN]);
  if (access.error) return access.error;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid user", 422);
  const callerOrg = access.session!.user.organisationId;
  if (callerOrg && parsed.data.role === "TRANSPORTER") return fail("Transporter logins are created via Transporter onboarding, not here", 422);
  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return fail("Email already registered", 409);
  if (parsed.data.organisationId) {
    const org = await prisma.organisation.findUnique({ where: { id: parsed.data.organisationId } });
    if (!org || org.deletedAt) return fail("Organisation not found", 422);
  }
  const { password, organisationId, roleIds, ...profile } = parsed.data;
  const finalOrgId = callerOrg ?? (organisationId ?? null);

  try {
    const user = await prisma.user.create({
      data: {
        ...profile,
        email,
        organisationId: finalOrgId,
        passwordHash: await bcrypt.hash(password, 12),
        roleAssignments: roleIds && roleIds.length > 0 ? { create: roleIds.map((roleId) => ({ roleId })) } : undefined,
      },
    });
    await audit({
      userId: access.session!.user.id,
      action: "USER_CREATED",
      entityType: "user",
      entityId: user.id,
      afterData: { email: user.email, role: user.role, organisationId: user.organisationId, roleIds },
    });
    const { passwordHash, ...safe } = user;
    return ok({ ...safe, roleAssignments: roleIds?.map((roleId) => ({ roleId })) || [] }, 201);
  } catch (error) {
    console.error("User creation error:", error);
    return fail("An error occurred while creating the user", 500);
  }
});
