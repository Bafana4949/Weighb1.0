import { config } from "dotenv";
config(); // Load .env from root
import { PrismaClient, RfidCredentialType } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding realistic mock data...");

  const adminUser = await prisma.user.findFirst({ where: { email: "admin@weighbridge.local" } });
  if (!adminUser) throw new Error("Super Admin not found.");

  // Create Client
  const client = await prisma.organisation.upsert({
    where: { code: "MHL" },
    update: {},
    create: {
      type: "MINING_COMPANY",
      name: "Mhlabeni Mining Test",
      code: "MHL",
      createdById: adminUser.id,
    },
  });

  // Create Site
  const site = await prisma.site.upsert({
    where: { code_organisationId: { code: "MHL-S1", organisationId: client.id } },
    update: {},
    create: {
      name: "Mhlabeni North Pit",
      code: "MHL-S1",
      organisationId: client.id,
      createdById: adminUser.id,
    },
  });

  // Create Transporter
  const transporter = await prisma.organisation.upsert({
    where: { code: "TL" },
    update: {},
    create: {
      type: "TRANSPORTER",
      name: "Thaba Logistics Test",
      code: "TL",
      createdById: adminUser.id,
    },
  });

  // Create Product
  const product = await prisma.product.upsert({
    where: { code_organisationId: { code: "COAL-01", organisationId: client.id } },
    update: {},
    create: {
      name: "Thermal Coal",
      code: "COAL-01",
      organisationId: client.id,
      createdById: adminUser.id,
    },
  });

  // Create Source & Destination
  const source = await prisma.source.upsert({
    where: { name_organisationId: { name: "North Pit Excavation", organisationId: client.id } },
    update: {},
    create: {
      name: "North Pit Excavation",
      organisationId: client.id,
      createdById: adminUser.id,
    },
  });

  const dest = await prisma.destination.upsert({
    where: { name_organisationId: { name: "Main Processing Plant", organisationId: client.id } },
    update: {},
    create: {
      name: "Main Processing Plant",
      organisationId: client.id,
      createdById: adminUser.id,
    },
  });

  // Create Truck
  const truck = await prisma.vehicle.upsert({
    where: { registrationNumber_organisationId: { registrationNumber: "AB 12 CD GP", organisationId: transporter.id } },
    update: {},
    create: {
      registrationNumber: "AB 12 CD GP",
      tareWeightKg: 15000,
      organisationId: transporter.id,
      createdById: adminUser.id,
    },
  });

  // Create Driver
  const driver = await prisma.driver.upsert({
    where: { idNumber_organisationId: { idNumber: "9001010000000", organisationId: transporter.id } },
    update: {},
    create: {
      name: "Sipho Khumalo",
      idNumber: "9001010000000",
      organisationId: transporter.id,
      createdById: adminUser.id,
    },
  });

  // Issue RFIDs
  await prisma.rfidCredential.upsert({
    where: { uid: "AA-BB-CC-01" },
    update: {},
    create: {
      uid: "AA-BB-CC-01",
      displayCode: "TRK-001",
      credentialType: RfidCredentialType.TRUCK,
      organisationId: client.id,
      vehicleId: truck.id,
      createdById: adminUser.id,
    },
  });

  await prisma.rfidCredential.upsert({
    where: { uid: "AA-BB-CC-02" },
    update: {},
    create: {
      uid: "AA-BB-CC-02",
      displayCode: "DRV-001",
      credentialType: RfidCredentialType.DRIVER,
      organisationId: client.id,
      driverId: driver.id,
      createdById: adminUser.id,
    },
  });

  // Setup Installation
  await prisma.weighbridgeInstallation.upsert({
    where: { siteId: site.id },
    update: {},
    create: {
      siteId: site.id,
      organisationId: client.id,
      name: "WB 1 North",
      code: "WB1N",
      maxCapacityKg: 80000,
      topology: "BIDIRECTIONAL_SINGLE",
    },
  });

  // Create Order
  const orderCount = await prisma.weighbridgeOrder.count();
  const orderNumber = `ORD-${String(orderCount + 1).padStart(6, "0")}`;
  const order = await prisma.weighbridgeOrder.create({
    data: {
      orderNumber,
      siteId: site.id,
      type: "DISPATCH",
      product: product.name,
      productRefId: product.id,
      sourceId: source.id,
      destinationId: dest.id,
      transporterName: transporter.name,
      estimatedMassKg: 100000,
      createdById: adminUser.id,
    },
  });

  console.log("Seeding complete. Order created:", order.orderNumber);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
