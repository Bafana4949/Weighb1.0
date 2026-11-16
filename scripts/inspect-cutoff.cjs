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

    const txs = await prisma.weighbridgeTransaction.findMany({
      where: {
        booking: { orderId: washedOrder.id },
        createdAt: { gte: new Date('2026-09-27T12:00:00Z') }
      },
      include: {
        vehicle: true,
      },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`Transactions created >= 2026-09-27 12:00 UTC (14:00 SAST): ${txs.length}`);
    for (const t of txs) {
      console.log(`Tx: ${t.id} | Waybill: ${t.waybillNumber} | Plate: ${t.vehicle.plate} | Status: ${t.status} | CreatedAt SAST: ${toSAST(t.createdAt)} (UTC: ${t.createdAt.toISOString()}) | CapturedAt SAST: ${toSAST(t.capturedAt)} | Entry SAST: ${toSAST(t.entryAt)} | Net: ${t.netWeightKg}`);
    }

    // Let's also check if there are transactions capturedAt >= 2026-09-27 19:14:36 SAST
    // 19:14:36 SAST = 17:14:36 UTC
    const cutoffUTC = new Date('2026-09-27T17:14:36Z');
    console.log(`\nCutoff UTC: ${cutoffUTC.toISOString()} (SAST: ${toSAST(cutoffUTC)})`);

    const byCreated = await prisma.weighbridgeTransaction.findMany({
      where: {
        booking: { orderId: washedOrder.id },
        createdAt: { gte: new Date('2026-09-27T17:14:00Z') }
      },
      include: { vehicle: true },
      orderBy: { createdAt: 'asc' }
    });
    console.log(`\nBy createdAt >= 17:14:00Z (${byCreated.length} records):`);
    for (const t of byCreated) {
      console.log(`  ${t.waybillNumber} | ${t.vehicle.plate} | Created: ${toSAST(t.createdAt)} | Captured: ${toSAST(t.capturedAt)} | Net: ${t.netWeightKg} | Status: ${t.status}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
