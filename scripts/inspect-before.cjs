const fs = require('fs');
const path = require('path');

const envFile = path.resolve(__dirname, '../.env');
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = (match[2] || '').trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function toSAST(date) {
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(date));
}

async function main() {
  try {
    const washedOrder = await prisma.weighbridgeOrder.findUnique({
      where: { orderNumber: 'plant-stockpad-washed-25092026' }
    });

    const txsBefore = await prisma.weighbridgeTransaction.findMany({
      where: {
        booking: { orderId: washedOrder.id },
        createdAt: { lt: new Date('2026-09-27T17:14:26Z') }
      },
      include: { vehicle: true },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log(`Last 10 transactions BEFORE 19:14:26 SAST on washed order:`);
    for (const t of txsBefore) {
      console.log(`  Tx ${t.id} | Waybill: ${t.waybillNumber} | Plate: ${t.vehicle.plate} | Created SAST: ${toSAST(t.createdAt)} | Captured SAST: ${toSAST(t.capturedAt)} | Net: ${t.netWeightKg}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
