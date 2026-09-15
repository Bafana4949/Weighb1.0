import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log("Updating Super Admin to Bafana Bhuda...");
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@weighbridge.co.za' },
    update: {
      firstName: 'Bafana',
      lastName: 'Bhuda',
      role: 'ADMIN',
      platformRole: 'PLATFORM_SUPER_ADMIN',
      status: 'ACTIVE',
      organisationId: null,
      deletedAt: null
    },
    create: {
      email: 'superadmin@weighbridge.co.za',
      firstName: 'Bafana',
      lastName: 'Bhuda',
      role: 'ADMIN',
      platformRole: 'PLATFORM_SUPER_ADMIN',
      status: 'ACTIVE',
      organisationId: null,
      passwordHash: await bcrypt.hash('SuperAdmin2026!', 12)
    }
  });
  console.log(`✓ Super Admin updated: ${superAdmin.firstName} ${superAdmin.lastName} (${superAdmin.email})`);

  console.log("\nEnsuring Coal In Motion exists...");
  let coalInMotion = await prisma.organisation.findFirst({
    where: { code: 'COALINMOTI' }
  });
  if (!coalInMotion) {
    coalInMotion = await prisma.organisation.create({
      data: {
        name: 'Coal In Motion',
        code: 'COALINMOTI',
        type: 'MINING_COMPANY',
        status: 'ACTIVE',
        isActive: true,
        contactEmail: 'admin@coalinmotion.co.za'
      }
    });
  }
  console.log(`✓ Coal In Motion organisation ID: ${coalInMotion.id}`);

  console.log("\nUpdating Grant Howell (Client / Company Admin)...");
  const grantPassHash = await bcrypt.hash('Grant@2026!', 12);
  const grantUser = await prisma.user.upsert({
    where: { email: 'grant@treadstone.co.za' },
    update: {
      firstName: 'Grant',
      lastName: 'Howell',
      role: 'ADMIN',
      platformRole: null,
      status: 'ACTIVE',
      organisationId: coalInMotion.id,
      passwordHash: grantPassHash,
      deletedAt: null
    },
    create: {
      email: 'grant@treadstone.co.za',
      firstName: 'Grant',
      lastName: 'Howell',
      role: 'ADMIN',
      platformRole: null,
      status: 'ACTIVE',
      organisationId: coalInMotion.id,
      passwordHash: grantPassHash
    }
  });
  console.log(`✓ Grant Howell updated: ${grantUser.firstName} ${grantUser.lastName} (${grantUser.email}) - Org: ${coalInMotion.name}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
