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
        createdAt: { gte: new Date('2026-09-27T17:14:00Z') } // >= 19:14:00 SAST
      },
      include: {
        vehicle: true,
        booking: true,
      },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`Found ${txs.length} transactions from 19:14 SAST onwards:`);
    let totalNet = 0;
    const plateCounts = {};

    for (let i = 0; i < txs.length; i++) {
      const t = txs[i];
      totalNet += t.netWeightKg;
      plateCounts[t.vehicle.plate] = (plateCounts[t.vehicle.plate] || 0) + 1;
      console.log(`${i+1}. Waybill: ${t.waybillNumber} | Plate: ${t.vehicle.plate} | Status: ${t.status} | Created SAST: ${toSAST(t.createdAt)} | Captured SAST: ${toSAST(t.capturedAt)} | Net: ${t.netWeightKg} kg | Old Booking Ref: ${t.booking.reference}`);
    }

    console.log("\nSummary by Truck:");
    console.table(plateCounts);
    console.log(`Total Net Weight to move: ${totalNet.toLocaleString()} kg (${(totalNet / 1000).toFixed(1)} t)`);

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
