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
        booking: { orderId: washedOrder.id }
      },
      include: {
        booking: true,
        vehicle: true,
      },
      orderBy: { capturedAt: 'asc' }
    });

    console.log(`Total transactions for washed order: ${txs.length}`);
    for (const t of txs) {
      console.log(`ID: ${t.id} | Waybill: ${t.waybillNumber} | Plate: ${t.vehicle.plate} | Status: ${t.status} | CapturedAt SAST: ${toSAST(t.capturedAt)} (UTC: ${t.capturedAt.toISOString()}) | CreatedAt SAST: ${toSAST(t.createdAt)} (UTC: ${t.createdAt.toISOString()}) | Entry SAST: ${toSAST(t.entryAt)} | Tare SAST: ${toSAST(t.tareCapturedAt)} | Gross SAST: ${toSAST(t.grossCapturedAt)} | BookingId: ${t.bookingId}`);
    }

    const bookings = await prisma.booking.findMany({
      where: { orderId: washedOrder.id },
      include: {
        vehicle: true,
        transactions: true,
      },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`\nTotal bookings for washed order: ${bookings.length}`);
    for (const b of bookings) {
      console.log(`Booking ID: ${b.id} | Ref: ${b.reference} | Plate: ${b.vehicle.plate} | Status: ${b.status} | Commodity: ${b.commodity} | Created SAST: ${toSAST(b.createdAt)} (UTC: ${b.createdAt.toISOString()}) | TxCount: ${b.transactions.length}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
