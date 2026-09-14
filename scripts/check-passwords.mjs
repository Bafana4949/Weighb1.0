import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const users = await prisma.user.findMany();
const candidatePasswords = [
  'SuperAdmin2026!',
  'superadmin2026!',
  'Superadmin2026!',
  'SuperAdmin2026',
  'Admin2026!',
  'admin2026!',
  'Operator2026!',
  'Transporter2026!',
  'Password123!',
  'admin123',
  'password'
];

for (const u of users) {
  let found = false;
  for (const p of candidatePasswords) {
    if (await bcrypt.compare(p, u.passwordHash)) {
      console.log(`✓ ${u.email} (${u.role}): "${p}"`);
      found = true;
      break;
    }
  }
  if (!found) {
    console.log(`? ${u.email} (${u.role}): Password unknown from candidates`);
  }
}

await prisma.$disconnect();
