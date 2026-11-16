import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { PERMISSION_CATALOGUE, BUILT_IN_ROLE_PERMISSIONS } from "./src/rbac-catalogue";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../.env");

if (fs.existsSync(envPath)) {
  config({ path: envPath, override: true });
} else {
  console.error(`❌ Root .env file not found at ${envPath}`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is missing.");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("=== Initializing Clean Production Weighbridge System ===");

  await prisma.$connect();
  console.log("✅ Successfully connected to Supabase database.");

  // 1. Seed RBAC Permissions Catalogue
  console.log("Seeding RBAC permissions...");
  const permissionRows = await Promise.all(
    PERMISSION_CATALOGUE.map((p) =>
      prisma.permission.upsert({
        where: { key: p.key },
        update: { description: p.description, category: p.category },
        create: { key: p.key, description: p.description, category: p.category },
      })
    )
  );
  const permissionByKey = new Map(permissionRows.map((p) => [p.key, p]));
  console.log(`✅ ${permissionRows.length} permissions configured.`);

  // 2. Seed Built-In Roles and Role Permissions
  console.log("Seeding built-in system roles...");
  for (const [roleName, keys] of Object.entries(BUILT_IN_ROLE_PERMISSIONS)) {
    const grantedKeys = keys === null ? PERMISSION_CATALOGUE.map((p) => p.key) : keys;
    const existingRole = await prisma.role.findFirst({
      where: { name: roleName, organisationId: null },
    });

    const role = existingRole ?? (await prisma.role.create({
      data: { organisationId: null, name: roleName, isBuiltIn: true },
    }));

    // Re-link permissions
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: grantedKeys
        .map((key) => {
          const perm = permissionByKey.get(key);
          return perm ? { roleId: role.id, permissionId: perm.id } : null;
        })
        .filter((item): item is { roleId: string; permissionId: string } => item !== null),
    });
  }
  console.log("✅ Built-in roles configured (ADMIN, OPERATOR, TRANSPORTER, SECURITY).");

  // 3. Seed / Ensure Initial Platform Super Admin Account
  // The initial password comes from SEED_SUPERADMIN_PASSWORD, or is generated once and
  // printed below. Re-running the seed never resets an existing account's password.
  const superAdminEmail = (process.env.SEED_SUPERADMIN_EMAIL?.trim() || "superadmin@weighbridge.co.za").toLowerCase();
  const providedPassword = process.env.SEED_SUPERADMIN_PASSWORD || undefined; // an empty line counts as unset
  if (providedPassword && providedPassword.length < 12) {
    console.error("❌ SEED_SUPERADMIN_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }
  const superAdminPassword = providedPassword ?? randomBytes(15).toString("base64url");
  const existing = await prisma.user.findUnique({ where: { email: superAdminEmail }, select: { id: true } });
  const passwordHash = await bcrypt.hash(superAdminPassword, 12);

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {
      role: "ADMIN",
      platformRole: "PLATFORM_SUPER_ADMIN",
      status: "ACTIVE",
      organisationId: null,
    },
    create: {
      email: superAdminEmail,
      firstName: "Super",
      lastName: "Admin",
      role: "ADMIN",
      platformRole: "PLATFORM_SUPER_ADMIN",
      status: "ACTIVE",
      passwordHash: passwordHash,
      organisationId: null,
    },
  });

  console.log("\n=======================================================");
  console.log("✅ Clean Platform Super Admin Ready:");
  console.log(`   Email:    ${superAdmin.email}`);
  if (existing) console.log("   Password: unchanged (account already existed)");
  else if (providedPassword) console.log("   Password: as set in SEED_SUPERADMIN_PASSWORD");
  else console.log(`   Password: ${superAdminPassword}   <- generated now; shown once, change it after first sign-in`);
  console.log(`   Role:     ${superAdmin.role}`);
  console.log(`   Platform: ${superAdmin.platformRole}`);
  console.log("=======================================================\n");
  console.log("✅ Production seed completed. ZERO mock data injected.");
}

main()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
