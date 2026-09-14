import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const accounts = [
  { email: 'superadmin@weighbridge.co.za', pass: 'SuperAdmin2026!' },
  { email: 'admin@seriti.co.za', pass: 'Admin2026!' },
  { email: 'operator@seriti.co.za', pass: 'Operator2026!' },
  { email: 'irfan@treadstone.co.za', pass: 'Transporter2026!' },
  { email: 'grant@treadstone.co.za', pass: 'Transporter2026!' }
];

for (const acc of accounts) {
  const hash = await bcrypt.hash(acc.pass, 12);
  await prisma.user.updateMany({
    where: { email: acc.email },
    data: { passwordHash: hash, status: 'ACTIVE', deletedAt: null }
  });
  console.log(`✓ Set ${acc.email} password to: "${acc.pass}"`);
}

await prisma.$disconnect();
