require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { PrismaClient } = require('./node_modules/@prisma/client');

const prisma = new PrismaClient();

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function seed() {
  console.log('Connecting to Supabase...');
  await prisma.$connect();
  console.log('Connected to Supabase successfully.');

  const adminPasswordHash = await bcrypt.hash('AdminPass123!', 10);
  const operatorPasswordHash = await bcrypt.hash('OperatorPass123!', 10);
  const transporterPasswordHash = await bcrypt.hash('TransporterPass123!', 10);

  // 1. Mining Company Organisation
  console.log('Creating Mining Organisation...');
  let miningOrg = await prisma.organisation.findFirst({ where: { name: 'Woestalleen Colliery' } });
  if (!miningOrg) {
    miningOrg = await prisma.organisation.create({
      data: {
        name: 'Woestalleen Colliery',
        registrationNo: '2024/091400/07',
        type: 'MINING_COMPANY',
        contactEmail: 'admin@weighbridge.co.za',
        contactPhone: '+27 13 246 1000',
        isActive: true,
      },
    });
  }

  // 2. Transporter Organisation
  console.log('Creating Transporter Organisation...');
  let haulierOrg = await prisma.organisation.findFirst({ where: { name: 'SG Coal Haulage' } });
  if (!haulierOrg) {
    haulierOrg = await prisma.organisation.create({
      data: {
        name: 'SG Coal Haulage',
        registrationNo: '2021/494901/07',
        type: 'HAULIER',
        contactEmail: 'transporter@weighbridge.co.za',
        contactPhone: '+27 82 555 1234',
        isActive: true,
      },
    });
  }

  // 3. Weighbridge Site
  console.log('Creating Weighbridge Site...');
  let site = await prisma.site.findUnique({ where: { code: 'WOESTALLEEN' } });
  if (!site) {
    site = await prisma.site.create({
      data: {
        organisationId: miningOrg.id,
        code: 'WOESTALLEEN',
        name: 'Woestalleen Weighbridge Complex',
        address: 'R555 Coal Corridor, Middelburg, Mpumalanga',
        latitude: -25.9612000,
        longitude: 29.5823000,
        isActive: true,
      },
    });
  }

  // 4. Site Config
  console.log('Creating Site Config...');
  const siteConfig = await prisma.siteConfig.findUnique({ where: { siteId: site.id } });
  if (!siteConfig) {
    await prisma.siteConfig.create({
      data: {
        siteId: site.id,
        operatingStart: '05:00',
        operatingEnd: '22:00',
        maxCapacityKg: 80000,
        stabilityThresholdKg: 20,
        autoApprovalEnabled: true,
        requireInsuranceValid: false,
        requireDriverLicenceValid: false,
      },
    });
  }

  // 5. Users
  console.log('Creating Users...');
  const usersToCreate = [
    {
      email: 'admin@weighbridge.co.za',
      passwordHash: adminPasswordHash,
      firstName: 'Bafana',
      lastName: 'Bhuda',
      role: 'ADMIN',
      organisationId: miningOrg.id,
    },
    {
      email: 'operator@weighbridge.co.za',
      passwordHash: operatorPasswordHash,
      firstName: 'Kagiso',
      lastName: 'Mokoena',
      role: 'OPERATOR',
      organisationId: miningOrg.id,
    },
    {
      email: 'transporter@weighbridge.co.za',
      passwordHash: transporterPasswordHash,
      firstName: 'Sipho',
      lastName: 'Transporter',
      role: 'TRANSPORTER',
      organisationId: haulierOrg.id,
    },
  ];

  const createdUsers = {};
  for (const u of usersToCreate) {
    let existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (!existing) {
      existing = await prisma.user.create({ data: u });
    }
    createdUsers[u.email] = existing;
  }

  // 6. Products, Sources, Destinations
  console.log('Creating Products & Destinations...');
  const adminId = createdUsers['admin@weighbridge.co.za'].id;

  let product = await prisma.product.findFirst({ where: { organisationId: miningOrg.id, code: 'COAL-RB1' } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        organisationId: miningOrg.id,
        code: 'COAL-RB1',
        name: 'Export Thermal Coal (RB1 6000 kcal/kg)',
        category: 'COAL',
        unitOfMeasure: 'TONNE',
        isActive: true,
        createdByUserId: adminId,
      },
    });
  }

  let destination = await prisma.destination.findFirst({ where: { organisationId: miningOrg.id, code: 'RBCT' } });
  if (!destination) {
    destination = await prisma.destination.create({
      data: {
        organisationId: miningOrg.id,
        code: 'RBCT',
        name: 'Richards Bay Coal Terminal (RBCT)',
        address: 'Quay 4, Port of Richards Bay',
        isActive: true,
        createdByUserId: adminId,
      },
    });
  }

  let source = await prisma.source.findFirst({ where: { organisationId: miningOrg.id, code: 'PIT-4' } });
  if (!source) {
    source = await prisma.source.create({
      data: {
        organisationId: miningOrg.id,
        code: 'PIT-4',
        name: 'Open Cast Pit 4 West',
        address: 'Sector 4B North Face',
        isActive: true,
        createdByUserId: adminId,
      },
    });
  }

  // 7. Vehicles
  console.log('Creating Vehicles...');
  const vehiclesData = [
    { plate: 'AB 123 CD GP', make: 'Mercedes-Benz', model: 'Actros 3352', tareWeightKg: 14500, legalMaxGvwKg: 56000 },
    { plate: 'CD 456 EF MP', make: 'Volvo', model: 'FH16 650', tareWeightKg: 15200, legalMaxGvwKg: 56000 },
    { plate: 'EF 789 GH MP', make: 'Scania', model: 'R560 Topline', tareWeightKg: 14800, legalMaxGvwKg: 56000 },
  ];

  const createdVehicles = [];
  for (const v of vehiclesData) {
    const norm = v.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    let existing = await prisma.vehicle.findFirst({
      where: { organisationId: haulierOrg.id, plateNormalized: norm },
    });
    if (!existing) {
      existing = await prisma.vehicle.create({
        data: {
          organisationId: haulierOrg.id,
          plate: v.plate,
          plateNormalized: norm,
          make: v.make,
          model: v.model,
          tareWeightKg: v.tareWeightKg,
          legalMaxGvwKg: v.legalMaxGvwKg,
          insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
        },
      });
    }
    createdVehicles.push(existing);
  }

  // 8. Drivers
  console.log('Creating Drivers...');
  const driversData = [
    { first: 'Sipho', last: 'Mahlangu', licence: 'LIC-ZA-994201', rfid: 'TAG-SG-001' },
    { first: 'Johan', last: 'van der Merwe', licence: 'LIC-ZA-994202', rfid: 'TAG-SG-002' },
    { first: 'Bongani', last: 'Khumalo', licence: 'LIC-ZA-994203', rfid: 'TAG-SG-003' },
  ];

  const createdDrivers = [];
  for (const d of driversData) {
    let existing = await prisma.driver.findFirst({ where: { licenceNumber: d.licence } });
    if (!existing) {
      existing = await prisma.driver.create({
        data: {
          organisationId: haulierOrg.id,
          firstName: d.first,
          lastName: d.last,
          idNumberEncrypted: 'enc_' + d.licence,
          idNumberHash: sha(d.licence),
          rfidTag: d.rfid,
          licenceNumber: d.licence,
          licenceExpiry: new Date(Date.now() + 700 * 24 * 60 * 60 * 1000),
          consentCapturedAt: new Date(),
        },
      });
    }
    createdDrivers.push(existing);
  }

  // 9. Weighbridge Order
  console.log('Creating Weighbridge Order...');
  let order = await prisma.weighbridgeOrder.findFirst({ where: { orderNumber: 'ORD-WOEST-2026-001' } });
  if (!order) {
    order = await prisma.weighbridgeOrder.create({
      data: {
        orderNumber: 'ORD-WOEST-2026-001',
        type: 'DISPATCH',
        siteId: site.id,
        sourceId: source.id,
        destinationId: destination.id,
        productId: product.id,
        product: product.name,
        customerName: 'Glencore International AG',
        supplierName: 'Woestalleen Colliery',
        estimatedMassKg: 1000000,
        stockpile: 'North Stockpile 4',
        status: 'ACTIVE',
        createdById: createdUsers['admin@weighbridge.co.za'].id,
      },
    });
  }

  // 10. Bookings (Pre-scheduled in Arrival Queue)
  console.log('Creating Bookings in Arrival Queue...');
  const now = new Date();
  for (let i = 0; i < createdVehicles.length; i++) {
    const v = createdVehicles[i];
    const d = createdDrivers[i];
    const ref = `BK-WOEST-2026-${(i + 1).toString().padStart(4, '0')}`;
    const token = `JT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    let existing = await prisma.booking.findUnique({ where: { reference: ref } });
    if (!existing) {
      await prisma.booking.create({
        data: {
          reference: ref,
          journeyToken: token,
          orderId: order.id,
          transporterOrganisationId: haulierOrg.id,
          siteId: site.id,
          vehicleId: v.id,
          driverId: d.id,
          commodity: product.name,
          targetTonnageKg: 34000,
          windowStart: new Date(now.getTime() - 2 * 60 * 60 * 1000),
          windowEnd: new Date(now.getTime() + 12 * 60 * 60 * 1000),
          status: 'APPROVED',
          approvalReason: 'Scheduled order booking for delivery',
          createdById: createdUsers['admin@weighbridge.co.za'].id,
          approvedById: createdUsers['admin@weighbridge.co.za'].id,
          approvedAt: now,
        },
      });
      console.log(`✓ Created Booking ${ref} for Truck ${v.plate}`);
    }
  }

  console.log('\n======================================================');
  console.log('🎉 SUPABASE DATABASE SEEDING COMPLETED SUCCESSFULLY!');
  console.log('======================================================');
  console.log('Default Accounts:');
  console.log('• Admin: admin@weighbridge.co.za / AdminPass123!');
  console.log('• Operator: operator@weighbridge.co.za / OperatorPass123!');
  console.log('• Transporter: transporter@weighbridge.co.za / TransporterPass123!');
  console.log('======================================================\n');
}

seed()
  .catch(err => {
    console.error('Seeding error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
