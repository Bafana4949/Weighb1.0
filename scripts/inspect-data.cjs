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

async function main() {
  try {
    const orders = await prisma.weighbridgeOrder.findMany({
      where: {
        orderNumber: { in: ['plant-stockpad-washed-25092026', 'Spiral-Plant-Siding-Spiral-27092026.', 'Spiral-Plant-Siding-Spiral-27092026'] }
      },
      include: {
        productRef: true,
      }
    });

    console.log("=== ORDERS ===");
    for (const o of orders) {
      console.log(`Order: id=${o.id} | number=${o.orderNumber} | product=${o.product} | type=${o.type} | status=${o.status}`);
    }

    const washedOrder = orders.find(o => o.orderNumber === 'plant-stockpad-washed-25092026');
    const spiralOrder = orders.find(o => o.orderNumber === 'Spiral-Plant-Siding-Spiral-27092026.');

    if (!washedOrder || !spiralOrder) {
      console.log("Could not find both orders!");
      return;
    }

    console.log(`\nWashed Order ID: ${washedOrder.id}`);
    console.log(`Spiral Order ID: ${spiralOrder.id}`);

    // All bookings for washed order
    const washedBookings = await prisma.booking.findMany({
      where: { orderId: washedOrder.id },
      include: {
        vehicle: true,
        driver: true,
        transactions: true,
      },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`\n=== BOOKINGS FOR plant-stockpad-washed-25092026 (${washedBookings.length} total) ===`);
    for (const b of washedBookings) {
      console.log(`Booking ${b.id} | ref=${b.reference} | plate=${b.vehicle.plate} | status=${b.status} | commodity=${b.commodity} | createdAt=${b.createdAt.toISOString()} | windowStart=${b.windowStart.toISOString()} | txCount=${b.transactions.length}`);
    }

    // All transactions linked to washed order
    const washedTxs = await prisma.weighbridgeTransaction.findMany({
      where: {
        booking: { orderId: washedOrder.id }
      },
      include: {
        booking: true,
        vehicle: true,
      },
      orderBy: { capturedAt: 'asc' }
    });

    console.log(`\n=== TRANSACTIONS FOR plant-stockpad-washed-25092026 (${washedTxs.length} total) ===`);
    for (const tx of washedTxs) {
      console.log(`Tx ${tx.id} | waybill=${tx.waybillNumber} | plate=${tx.vehicle.plate} | status=${tx.status} | commodity=${tx.commodity} | capturedAt=${tx.capturedAt.toISOString()} | createdAt=${tx.createdAt.toISOString()} | gross=${tx.grossWeightKg} | tare=${tx.tareWeightKg} | net=${tx.netWeightKg}`);
    }

    // Bookings for spiral order
    const spiralBookings = await prisma.booking.findMany({
      where: { orderId: spiralOrder.id },
      include: {
        vehicle: true,
        transactions: true,
      },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`\n=== BOOKINGS FOR Spiral-Plant-Siding-Spiral-27092026. (${spiralBookings.length} total) ===`);
    for (const b of spiralBookings) {
      console.log(`Booking ${b.id} | ref=${b.reference} | plate=${b.vehicle.plate} | status=${b.status} | commodity=${b.commodity} | createdAt=${b.createdAt.toISOString()} | txCount=${b.transactions.length}`);
    }

    // Transactions for spiral order
    const spiralTxs = await prisma.weighbridgeTransaction.findMany({
      where: {
        booking: { orderId: spiralOrder.id }
      },
      include: {
        booking: true,
        vehicle: true,
      },
      orderBy: { capturedAt: 'asc' }
    });

    console.log(`\n=== TRANSACTIONS FOR Spiral-Plant-Siding-Spiral-27092026. (${spiralTxs.length} total) ===`);
    for (const tx of spiralTxs) {
      console.log(`Tx ${tx.id} | waybill=${tx.waybillNumber} | plate=${tx.vehicle.plate} | status=${tx.status} | commodity=${tx.commodity} | capturedAt=${tx.capturedAt.toISOString()} | gross=${tx.grossWeightKg} | tare=${tx.tareWeightKg} | net=${tx.netWeightKg}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
