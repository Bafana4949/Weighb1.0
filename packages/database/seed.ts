import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, BookingStatus, IncidentType, OrganisationType, Severity, UserRole } from "@prisma/client";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env");

if (fs.existsSync(envPath)) {
  config({ path: envPath });
} else {
  console.error(`❌ Root .env file not found at ${envPath}`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is missing.");
  process.exit(1);
}

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const now = new Date();

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sensitiveHash(value: string): string {
  const pepper = process.env.PASSWORD_PEPPER ?? process.env.AUTH_SECRET ?? "development-pepper-change-before-production";
  return sha(`${pepper}:${value}`);
}

function encryptSensitive(value: string): string {
  const secret = process.env.AUTH_SECRET ?? "development-secret-change-before-production";
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

function normalisePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function waybill(siteCode: string, sequence: number): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `WB-${siteCode}-${date}-${String(sequence).padStart(4, "0")}`;
}

async function main(): Promise<void> {
  try {
    await prisma.$connect();
    console.log("✅ Successfully connected to the database.");
  } catch (err) {
    console.error("❌ Failed to connect to the database. Ensure PostgreSQL is running and DATABASE_URL is correct.");
    console.error(err);
    process.exit(1);
  }

  // Safety check to avoid clearing production data
  if (!process.env.DATABASE_URL?.includes("localhost") && process.env.NODE_ENV === "production") {
    console.error("❌ Seeding is not permitted on a production database.");
    process.exit(1);
  }

  await prisma.notification.deleteMany();
  await prisma.calibrationCertificate.deleteMany();
  await prisma.hardwareStatus.deleteMany();
  await prisma.hardwareDevice.deleteMany();
  await prisma.systemLog.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.gateEvent.deleteMany();
  await prisma.weighbridgeTransaction.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.trailer.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.siteConfig.deleteMany();
  await prisma.site.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organisation.deleteMany();

  const mine = await prisma.organisation.create({
    data: {
      name: "Coal Processors International (Pty) Ltd",
      registrationNo: "2026/100001/07",
      type: OrganisationType.MINING_COMPANY,
      contactEmail: "operations@cpi.example",
      contactPhone: "+27 12 555 0100",
    },
  });
  const haulier = await prisma.organisation.create({
    data: {
      name: "Treadstone Logistics",
      registrationNo: "2021/220045/07",
      type: OrganisationType.HAULIER,
      contactEmail: "dispatch@treadstonelogistics.example",
      contactPhone: "+27 13 555 0200",
    },
  });
  await prisma.organisation.create({
    data: {
      name: "Salaria Mining Services (Pty) Ltd",
      registrationNo: "2022/330078/07",
      type: OrganisationType.SERVICE_PROVIDER,
      contactEmail: "info@salaria.co.za",
      contactPhone: "+27 13 555 0300",
    },
  });
  await prisma.organisation.create({
    data: {
      name: "Coal in Motion",
      registrationNo: "2019/440092/07",
      type: OrganisationType.HAULIER,
      contactEmail: "dispatch@coalinmotion.example",
      contactPhone: "+27 13 555 0400",
    },
  });

  const site = await prisma.site.create({
    data: {
      organisationId: mine.id,
      code: "WOESTALLEEN",
      name: "Woestalleen Colliery",
      address: "Woestalleen, Middelburg, Mpumalanga, South Africa",
      latitude: -25.7754,
      longitude: 29.4646,
      config: { create: {} },
    },
  });

  const passwordHash = await bcrypt.hash("Password123!", 12);
  const admin = await prisma.user.create({ data: { organisationId: mine.id, email: "admin@weighbridge.local", passwordHash, firstName: "Amina", lastName: "Mokoena", phone: "+27660179070", role: UserRole.ADMIN } });
  const operator = await prisma.user.create({ data: { organisationId: mine.id, email: "operator@weighbridge.local", passwordHash, firstName: "Thabo", lastName: "Nkosi", phone: "+27 82 555 1002", role: UserRole.OPERATOR } });
  const security = await prisma.user.create({ data: { organisationId: mine.id, email: "security@weighbridge.local", passwordHash, firstName: "Naledi", lastName: "Maseko", phone: "+27 82 555 1003", role: UserRole.SECURITY } });
  const transporter = await prisma.user.create({ data: { organisationId: haulier.id, email: "transporter@weighbridge.local", passwordHash, firstName: "Kabelo", lastName: "Dlamini", phone: "+27 82 555 1004", role: UserRole.TRANSPORTER } });

  const plates = ["AB 123 CD GP", "CD 456 EF MP", "EF 789 GH GP", "GH 234 JK NW", "JK 567 LM GP", "LM 890 NP NC", "NP 321 QR GP", "QR 654 ST MP", "ST 987 UV GP", "UV 135 WX KZN"];
  const vehicles = [];
  for (let i = 0; i < plates.length; i += 1) {
    const plate = plates[i]!;
    vehicles.push(await prisma.vehicle.create({
      data: {
        organisationId: haulier.id,
        plate,
        plateNormalized: normalisePlate(plate),
        make: i % 2 === 0 ? "Scania" : "Volvo",
        model: i % 2 === 0 ? "R500" : "FH16",
        year: 2018 + (i % 7),
        vin: `VINZA${String(i + 1).padStart(12, "0")}`,
        tareWeightKg: 16800 + i * 120,
        legalMaxGvwKg: 56000,
        insuranceExpiry: new Date(now.getTime() + (90 + i * 7) * DAY),
      },
    }));
  }

  const drivers = [];
  const driverNames = [["Sipho", "Mahlangu"], ["Lerato", "Molefe"], ["Musa", "Khumalo"], ["Palesa", "Mokoena"], ["Bongani", "Zulu"]];
  for (let i = 0; i < driverNames.length; i += 1) {
    const [firstName, lastName] = driverNames[i]!;
    const idNo = `85010${i + 1}58000${i}`;
    drivers.push(await prisma.driver.create({
      data: {
        organisationId: haulier.id,
        firstName,
        lastName,
        idNumberEncrypted: encryptSensitive(idNo),
        idNumberHash: sensitiveHash(idNo),
        rfidTag: `DRV00${421 + i}`,
        photoUrl: `/seed/drivers/driver-${i + 1}.jpg`,
        licenceNumber: `ZA-DL-${String(i + 1).padStart(6, "0")}`,
        licenceExpiry: new Date(now.getTime() + (180 + i * 20) * DAY),
        consentCapturedAt: new Date(now.getTime() - 30 * DAY),
      },
    }));
  }

  const trailers = [];
  for (let i = 0; i < 5; i += 1) {
    trailers.push(await prisma.trailer.create({ data: { vehicleId: vehicles[i]!.id, trailerId: `TRL-${String(i + 1).padStart(4, "0")}`, registrationNo: `TR ${100 + i} GP`, type: "Side tipper", tareWeightKg: 7800 + i * 100 } }));
  }

  const bookings = [];
  for (let i = 0; i < 8; i += 1) {
    const status = i < 5 ? BookingStatus.APPROVED : BookingStatus.PENDING;
    bookings.push(await prisma.booking.create({
      data: {
        reference: `BK-${now.getFullYear()}-${String(i + 1).padStart(5, "0")}`,
        journeyToken: `JT-${randomUUID().slice(0, 8).toUpperCase()}`,
        transporterOrganisationId: haulier.id,
        siteId: site.id,
        vehicleId: vehicles[i]!.id,
        trailerId: trailers[i % trailers.length]!.id,
        driverId: drivers[i % drivers.length]!.id,
        commodity: i % 2 === 0 ? "IRON_ORE" : "COAL",
        commodityDescription: i % 2 === 0 ? "Run-of-mine iron ore" : "Thermal coal",
        targetTonnageKg: 36000 + i * 500,
        windowStart: new Date(now.getTime() - 60 * 60 * 1000),
        windowEnd: new Date(now.getTime() + (6 + i) * 60 * 60 * 1000),
        status,
        createdById: transporter.id,
        approvedById: status === BookingStatus.APPROVED ? admin.id : null,
        approvedAt: status === BookingStatus.APPROVED ? new Date(now.getTime() - 2 * 60 * 60 * 1000) : null,
        approvalReason: status === BookingStatus.APPROVED ? "Auto-approved: all compliance checks passed" : null,
      },
    }));
  }

  let previousHash = "0".repeat(64);
  for (let i = 0; i < 12; i += 1) {
    const booking = bookings[i % 5]!;
    const vehicle = vehicles[i % 5]!;
    const driver = drivers[i % drivers.length]!;
    const gross = vehicle.tareWeightKg + 33000 + i * 180;
    const net = gross - vehicle.tareWeightKg;
    const capturedAt = new Date(now.getTime() - (12 - i) * 3 * 60 * 60 * 1000);
    const integrityHash = sha(JSON.stringify({ bookingId: booking.id, gross, net, capturedAt: capturedAt.toISOString(), previousHash }));
    await prisma.weighbridgeTransaction.create({
      data: {
        edgeTransactionId: `EDGE-SEED-${String(i + 1).padStart(5, "0")}`,
        bookingId: booking.id,
        vehicleId: vehicle.id,
        trailerId: booking.trailerId,
        driverId: driver.id,
        siteId: booking.siteId,
        operatorId: i % 3 === 0 ? operator.id : null,
        grossWeightKg: gross,
        tareWeightKg: vehicle.tareWeightKg,
        netWeightKg: net,
        commodity: booking.commodity,
        overload: false,
        overloadVarianceKg: 0,
        anprConfidence: 0.93,
        entryPhotoUrl: `/seed/evidence/entry-${i + 1}.jpg`,
        scalePhotoUrl: `/seed/evidence/scale-${i + 1}.jpg`,
        waybillNumber: waybill(site.code, i + 1),
        confirmationHash: sha(`cloud-confirmation-${i}`),
        previousHash,
        integrityHash,
        entryAt: new Date(capturedAt.getTime() - 22 * 60 * 1000),
        capturedAt,
        exitAt: new Date(capturedAt.getTime() + 7 * 60 * 1000),
        turnaroundSeconds: 29 * 60,
      },
    });
    previousHash = integrityHash;
  }

  await prisma.hardwareDevice.create({
    data: {
      siteId: site.id,
      deviceKey: "SCALE-01",
      name: "Woestalleen Weighbridge",
      type: "SCALE",
      serialNumber: "WB-SIM-0001",
      firmwareVersion: "simulator-1.0.0",
      lastCalibrationDate: new Date(now.getTime() - 150 * DAY),
      calibrationExpiryDate: new Date(now.getTime() + 30 * DAY),
      statuses: { create: { siteId: site.id, health: "ONLINE", lastSeen: now, sensorReadings: { weight_kg: 0, p1: false, p2: false }, connectivity: { serial: true, mqtt: true, cloud: true } } },
      calibrationCertificates: { create: { siteId: site.id, certificateNumber: "NRCS-WB-2026-001", issuingAuthority: "Accredited Metrology Laboratory", calibratedAt: new Date(now.getTime() - 150 * DAY), expiresAt: new Date(now.getTime() + 30 * DAY), documentUrl: "/seed/certificates/NRCS-WB-2026-001.pdf", accuracyClass: "Class III" } },
    },
  });

  await prisma.incident.create({ data: { siteId: site.id, vehicleId: vehicles[7]!.id, driverId: drivers[2]!.id, type: IncidentType.TARE_DRIFT, severity: Severity.HIGH, title: "Tare weight drift detected", description: "Recorded tare differs by 720 kg from the vehicle baseline. Operator review required.", anomalyScore: 35 } });
  await prisma.incident.create({ data: { siteId: site.id, vehicleId: vehicles[4]!.id, type: IncidentType.ROUTE_DEVIATION, severity: Severity.MEDIUM, title: "Travel time anomaly", description: "Travel time exceeded the configured corridor baseline by 84 minutes.", anomalyScore: 18 } });

  console.log("Seed complete.");
  console.log("Demo users: admin/operator/security/transporter @weighbridge.local");
  console.log("Password: Password123!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
