import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, BookingStatus, IncidentType, OrganisationType, OrderStatus, OrderType, Severity, UserRole } from "@prisma/client";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { PERMISSION_CATALOGUE, BUILT_IN_ROLE_PERMISSIONS } from "./src/rbac-catalogue";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../.env");

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
  await prisma.serviceOrderAttachment.deleteMany();
  await prisma.serviceOrderComment.deleteMany();
  await prisma.serviceOrder.deleteMany();
  await prisma.fleetRoster.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.weighbridgeOrder.deleteMany();
  await prisma.vehicleTransporterAssignment.deleteMany();
  await prisma.trailer.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.userSiteAccess.deleteMany();
  await prisma.userRoleAssignment.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.lane.deleteMany();
  await prisma.siteConfig.deleteMany();
  await prisma.site.deleteMany();
  await prisma.source.deleteMany();
  await prisma.destination.deleteMany();
  await prisma.product.deleteMany();
  await prisma.rfidCredential.deleteMany();
  await prisma.user.deleteMany();
  await prisma.miningCompanyTransporter.deleteMany();
  await prisma.organisation.deleteMany();

  const mine = await prisma.organisation.create({
    data: {
      name: "Seriti Resources",
      code: "SERITI",
      registrationNo: "2026/100001/07",
      type: OrganisationType.MINING_COMPANY,
      contactEmail: "operations@seriti.example",
      contactPhone: "+27 12 555 0100",
    },
  });
  const haulier = await prisma.organisation.create({
    data: {
      name: "SG Coal",
      code: "SGCOAL",
      registrationNo: "2021/220045/07",
      type: OrganisationType.HAULIER,
      contactEmail: "dispatch@sgcoal.example",
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
  const coalInMotion = await prisma.organisation.create({
    data: {
      name: "Reinhardt Transport Group",
      code: "REINHARDT",
      registrationNo: "2019/440092/07",
      type: OrganisationType.HAULIER,
      contactEmail: "dispatch@reinhardt.example",
      contactPhone: "+27 13 555 0400",
    },
  });

  await prisma.miningCompanyTransporter.createMany({
    data: [
      { miningCompanyId: mine.id, transporterId: haulier.id },
      { miningCompanyId: mine.id, transporterId: coalInMotion.id },
    ]
  });

  const additionalTransporters = [
    "Simeliza Transport", "Comotrans Bulk Transport", "Chrome Carriers",
    "GKOK Transport", "Wessels Vervoer", "Rustgold Transport"
  ];
  for (const tName of additionalTransporters) {
    await prisma.organisation.create({
      data: {
        name: tName,
        code: tName.replace(/[^a-zA-Z0-9]/g, "").substring(0, 15).toUpperCase(),
        type: OrganisationType.HAULIER,
        contactEmail: `dispatch@${tName.toLowerCase().replace(/\\s/g, "")}.example`
      }
    });
  }

  // Demonstrates the client onboarding lifecycle: a second mining company that
  // has registered but not yet completed setup (no site, not yet activated).
  await prisma.organisation.create({
    data: {
      name: "Thungela Resources",
      code: "THUNGELA",
      registrationNo: "2026/550012/07",
      type: OrganisationType.MINING_COMPANY,
      contactEmail: "setup@thungela.example",
      contactPhone: "+27 14 555 0500",
      status: "PENDING_SETUP",
    },
  });

  const clientB = await prisma.organisation.create({
    data: {
      name: "Glencore Operations SA",
      code: "GLENCORE",
      registrationNo: "2026/660012/07",
      type: OrganisationType.MINING_COMPANY,
      contactEmail: "admin@glencore.example",
      contactPhone: "+27 15 555 0600",
      status: "ACTIVE",
    },
  });

  const additionalMines = [
    "Exxaro Resources", "Anglo Inyosi Coal", "South Witbank Colliery",
    "Transalloys", "Sibanye-Stillwater", "Harmony Gold", "Gold Fields",
    "DRDGOLD", "Gold One Group", "Anglo American Platinum",
    "Impala Platinum", "Glencore-Merafe Chrome", "Samancor Chrome"
  ];
  for (const mName of additionalMines) {
    await prisma.organisation.create({
      data: {
        name: mName,
        code: mName.replace(/[^a-zA-Z0-9]/g, "").substring(0, 15).toUpperCase(),
        type: OrganisationType.MINING_COMPANY,
        status: "ACTIVE",
        contactEmail: `admin@${mName.toLowerCase().replace(/\\s/g, "")}.example`
      }
    });
  }

  const site = await prisma.site.create({
    data: {
      organisationId: mine.id,
      code: "WOESTALLEEN",
      name: "Woestalleen Colliery",
      address: "Woestalleen, Middelburg, Mpumalanga, South Africa",
      latitude: -25.7754,
      longitude: 29.4646,
      topology: "BIDIRECTIONAL_SINGLE",
      config: { create: {} },
    },
  });

  // Second site demonstrating the dual entry/exit weighbridge topology: two
  // independent decks (lanes), each with its own site-daemon hardware
  // connection — see apps/site-daemon/config.dual.docker.yaml and the
  // hardware-simulator-lane-a/b services in docker-compose.yml.
  const secondSite = await prisma.site.create({
    data: {
      organisationId: mine.id,
      code: "EX-OO1",
      name: "Exxaro",
      address: "Lephalale, Limpopo, South Africa",
      latitude: -23.6688,
      longitude: 27.7419,
      topology: "DUAL_ENTRY_EXIT",
      config: { create: {} },
      lanes: { create: [
        { laneNumber: 1, name: "North gate", direction: "ENTRY" },
        { laneNumber: 2, name: "South gate", direction: "EXIT" },
      ] },
    },
  });

  const siteB = await prisma.site.create({
    data: {
      organisationId: clientB.id,
      code: "SITE-B",
      name: "Global Minerals Site",
      address: "Some Address, GP, South Africa",
      latitude: -26.0,
      longitude: 28.0,
      topology: "BIDIRECTIONAL_SINGLE",
      config: { create: {} },
    },
  });

  const passwordHash = await bcrypt.hash("Password123!", 12);
  // The platform super-admin: organisationId null + platformRole set, sees
  // and manages every client. Matches the account this project has actually
  // been using as the platform administrator throughout development.
  const admin = await prisma.user.create({ data: { organisationId: null, platformRole: "PLATFORM_SUPER_ADMIN", email: "admin@weighbridge.local", passwordHash, firstName: "Bafana", lastName: "Bhuda", phone: "+27660179070", role: UserRole.ADMIN } });
  // A client-scoped administrator for Coal Processors International — separate
  // from the platform super-admin, demonstrating the normal tenant boundary.
  const mineAdmin = await prisma.user.create({ data: { organisationId: mine.id, email: "mine-admin@weighbridge.local", passwordHash, firstName: "Zanele", lastName: "Khumalo", phone: "+27 82 555 1001", role: UserRole.ADMIN } });
  const operator = await prisma.user.create({ data: { organisationId: mine.id, email: "operator@weighbridge.local", passwordHash, firstName: "Thabo", lastName: "Nkosi", phone: "+27 82 555 1002", role: UserRole.OPERATOR } });
  const security = await prisma.user.create({ data: { organisationId: mine.id, email: "security@weighbridge.local", passwordHash, firstName: "Naledi", lastName: "Maseko", phone: "+27 82 555 1003", role: UserRole.SECURITY } });
  const supervisor = await prisma.user.create({ data: { organisationId: mine.id, email: "supervisor@weighbridge.local", passwordHash, firstName: "Given", lastName: "Ndlovu", phone: "+27 82 555 1005", role: UserRole.OPERATOR } });
  const viewer = await prisma.user.create({ data: { organisationId: mine.id, email: "viewer@weighbridge.local", passwordHash, firstName: "Precious", lastName: "Sithole", phone: "+27 82 555 1006", role: UserRole.OPERATOR } });
  const transporter = await prisma.user.create({ data: { organisationId: haulier.id, email: "transporter@weighbridge.local", passwordHash, firstName: "Kabelo", lastName: "Dlamini", phone: "+27 82 555 1004", role: UserRole.TRANSPORTER } });
  const customRoleUser = await prisma.user.create({ data: { organisationId: mine.id, email: "custom@weighbridge.local", passwordHash, firstName: "Custom", lastName: "Role", phone: "+27 82 555 1007", role: UserRole.OPERATOR } });
  const suspendedUser = await prisma.user.create({ data: { organisationId: mine.id, email: "suspended@weighbridge.local", passwordHash, firstName: "Suspended", lastName: "User", phone: "+27 82 555 1008", role: UserRole.OPERATOR, status: "SUSPENDED" } });
  const clientBAdmin = await prisma.user.create({ data: { organisationId: clientB.id, email: "clientb-admin@weighbridge.local", passwordHash, firstName: "ClientB", lastName: "Admin", phone: "+27 82 555 2001", role: UserRole.ADMIN } });

  // Dynamically generate users for all other MINING_COMPANY and HAULIER orgs
  const allMines = await prisma.organisation.findMany({ where: { type: OrganisationType.MINING_COMPANY } });
  for (const m of allMines) {
    if (m.id === mine.id || m.id === clientB.id || m.id === secondSite?.organisationId) continue;
    const pfx = m.code.toLowerCase();
    const mAdmin = await prisma.user.create({ data: { organisationId: m.id, email: `admin@${pfx}.local`, passwordHash, firstName: "Admin", lastName: m.code, phone: "+27 82 000 0001", role: UserRole.ADMIN } });
    await prisma.user.create({ data: { organisationId: m.id, email: `supervisor@${pfx}.local`, passwordHash, firstName: "Sup", lastName: m.code, phone: "+27 82 000 0002", role: UserRole.OPERATOR } });
    await prisma.user.create({ data: { organisationId: m.id, email: `operator@${pfx}.local`, passwordHash, firstName: "Op", lastName: m.code, phone: "+27 82 000 0003", role: UserRole.OPERATOR } });

    // Generate Site, Hardware, and Entities
    const mSite = await prisma.site.create({
      data: {
        organisationId: m.id,
        code: `${m.code}-S1`,
        name: `${m.name} Main Site`,
        address: "Mining Site Address, South Africa",
        latitude: -26.0,
        longitude: 28.0,
        topology: "BIDIRECTIONAL_SINGLE",
        config: { create: {} }
      }
    });

    await prisma.weighbridgeInstallation.create({
      data: {
        siteId: mSite.id,
        organisationId: m.id,
        name: "Main Weighbridge",
        code: `${m.code}-WB1`,
        maxCapacityKg: 80000
      }
    });

    await prisma.hardwareDevice.create({
      data: {
        siteId: mSite.id,
        deviceKey: `SCALE-${mSite.code}`,
        name: "Main Scale",
        type: "SCALE"
      }
    });

    await prisma.source.create({ data: { organisationId: m.id, createdByUserId: mAdmin.id, name: `${m.code} Source`, code: `${m.code}-SRC`, description: "Primary source pit" } });
    await prisma.destination.create({ data: { organisationId: m.id, createdByUserId: mAdmin.id, name: `${m.code} Dest`, code: `${m.code}-DST`, description: "Primary destination terminal" } });
    await prisma.product.create({ data: { organisationId: m.id, createdByUserId: mAdmin.id, name: `${m.code} Product`, code: `${m.code}-PRD`, description: "Primary product" } });
  }

  let driverCounter = 0;
  const allHauliers = await prisma.organisation.findMany({ where: { type: OrganisationType.HAULIER } });
  for (const h of allHauliers) {
    if (h.id === haulier.id) continue;
    const pfx = h.code.toLowerCase();
    await prisma.user.create({ data: { organisationId: h.id, email: `transporter@${pfx}.local`, passwordHash, firstName: "Driver", lastName: h.code, phone: "+27 82 000 0004", role: UserRole.TRANSPORTER } });
    
    // Generate Fleet for this haulier
    for (let i = 0; i < 5; i++) {
      const v = await prisma.vehicle.create({
        data: {
          organisationId: h.id,
          plate: `${pfx.substring(0,3).toUpperCase()} ${100+i} GP`,
          plateNormalized: `${pfx.substring(0,3).toUpperCase()}${100+i}GP`,
          make: i % 2 === 0 ? "Scania" : "Volvo",
          model: "R500",
          year: 2020,
          vin: `VIN${h.code}${i}`,
          tareWeightKg: 16000,
          legalMaxGvwKg: 56000,
          insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        }
      });
      const d = await prisma.driver.create({
        data: {
          organisationId: h.id,
          firstName: "Driver",
          lastName: `${i} ${h.code}`,
          idNumberEncrypted: encryptSensitive(`85010158${String(driverCounter).padStart(5, "0")}`),
          idNumberHash: sensitiveHash(`85010158${String(driverCounter).padStart(5, "0")}`),
          rfidTag: `TAG${h.code}${i}`,
          photoUrl: `/seed/drivers/driver-1.jpg`,
          licenceNumber: `DL-${h.code}-${i}`,
          licenceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          consentCapturedAt: new Date(),
        }
      });
      driverCounter++;
      await prisma.trailer.create({
        data: {
          vehicleId: v.id,
          trailerId: `TRL-${h.code}-${i}`,
          registrationNo: `TR${String(driverCounter).padStart(3, "0")} GP`,
          type: "Side tipper",
          tareWeightKg: 7800
        }
      });

      await prisma.rfidCredential.create({
        data: {
          uid: `RFID-VEH-${h.code}-${i}`,
          credentialType: "TRUCK",
          organisationId: h.id,
          vehicleId: v.id,
          createdById: admin.id
        }
      });

      await prisma.rfidCredential.create({
        data: {
          uid: `RFID-DRV-${h.code}-${i}`,
          credentialType: "DRIVER",
          organisationId: h.id,
          driverId: d.id,
          createdById: admin.id
        }
      });
    }
  }

  const sourceMineA = await prisma.source.create({ data: { organisationId: mine.id, createdByUserId: mineAdmin.id, name: "Pit 1 North", code: "PIT1-N", description: "Northern open cast pit", latitude: -25.77, longitude: 29.46 } });
  const sourceMineB = await prisma.source.create({ data: { organisationId: mine.id, createdByUserId: mineAdmin.id, name: "Pit 2 South", code: "PIT2-S", description: "Southern reserve", latitude: -25.78, longitude: 29.47 } });
  const destMineA = await prisma.destination.create({ data: { organisationId: mine.id, createdByUserId: mineAdmin.id, name: "Richards Bay Terminal", code: "RBCT", description: "Export terminal", latitude: -28.79, longitude: 32.04 } });
  const destMineB = await prisma.destination.create({ data: { organisationId: mine.id, createdByUserId: mineAdmin.id, name: "Kendal Power Station", code: "KENDAL", description: "Eskom local delivery", latitude: -26.09, longitude: 28.97 } });
  const productMineA = await prisma.product.create({ data: { organisationId: mine.id, createdByUserId: mineAdmin.id, name: "RB1 Export Coal", code: "RB1", description: "High grade export coal, 6000 kcal/kg", unitOfMeasure: "TONNE" } });
  const productMineB = await prisma.product.create({ data: { organisationId: mine.id, createdByUserId: mineAdmin.id, name: "RB2 Coal", code: "RB2", description: "Standard export thermal coal, 5500 kcal/kg", unitOfMeasure: "TONNE" } });
  const productMineC = await prisma.product.create({ data: { organisationId: mine.id, createdByUserId: mineAdmin.id, name: "RB3 Coal", code: "RB3", description: "Secondary grade export coal, 5000 kcal/kg", unitOfMeasure: "TONNE" } });
  const productMineD = await prisma.product.create({ data: { organisationId: mine.id, createdByUserId: mineAdmin.id, name: "Duff Coal", code: "DUFF", description: "Fine duff power station feed, 0-6mm", unitOfMeasure: "TONNE" } });
  const productMineE = await prisma.product.create({ data: { organisationId: mine.id, createdByUserId: mineAdmin.id, name: "Eskom Grade Coal", code: "ESKOM", description: "Local power station feed, 4800 kcal/kg", unitOfMeasure: "TONNE" } });
  const productMineF = await prisma.product.create({ data: { organisationId: mine.id, createdByUserId: mineAdmin.id, name: "Peas Coal", code: "PEAS", description: "Washed industrial sized peas, 6-25mm", unitOfMeasure: "TONNE" } });
  const productMineG = await prisma.product.create({ data: { organisationId: mine.id, createdByUserId: mineAdmin.id, name: "Nuts Coal", code: "NUTS", description: "Industrial boiler sized nuts, 25-50mm", unitOfMeasure: "TONNE" } });

  const sourceClientB = await prisma.source.create({ data: { organisationId: clientB.id, createdByUserId: clientBAdmin.id, name: "Kumba Iron Ore", code: "KUMBA", description: "Iron ore reserve", latitude: -27.7, longitude: 23.0 } });
  const destClientB = await prisma.destination.create({ data: { organisationId: clientB.id, createdByUserId: clientBAdmin.id, name: "Saldanha Steel", code: "SALDANHA", description: "Steel mill", latitude: -33.02, longitude: 18.01 } });
  const productClientB = await prisma.product.create({ data: { organisationId: clientB.id, createdByUserId: clientBAdmin.id, name: "Iron Ore Fines", code: "IO-FINES", description: "Standard fine ore", unitOfMeasure: "TONNE" } });

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
  const driverNames: [string, string][] = [["Sipho", "Mahlangu"], ["Lerato", "Molefe"], ["Musa", "Khumalo"], ["Palesa", "Mokoena"], ["Bongani", "Zulu"]];
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

  const orders = [
    await prisma.weighbridgeOrder.create({
      data: {
        orderNumber: `ORD-${now.getFullYear()}-00001`,
        type: OrderType.DISPATCH,
        siteId: site.id,
        originSiteId: site.id,
        destinationSiteId: secondSite.id,
        customerName: "Richards Bay Coal Terminal (RBCT)",
        supplierName: "Seriti Resources (Woestalleen Colliery)",
        product: "High-Grade Export Coal (RB1 6000 kcal/kg)",
        stockpile: "Stockpile 1 (ROM-A)",
        notes: "Priority export shipment - Certified Grade A",
        estimatedMassKg: 500000,
        status: OrderStatus.ACTIVE,
        createdById: admin.id,
      },
    }),
    await prisma.weighbridgeOrder.create({
      data: {
        orderNumber: `ORD-${now.getFullYear()}-00002`,
        type: OrderType.DISPATCH,
        siteId: site.id,
        originSiteId: site.id,
        customerName: "Saldanha Steel Works",
        supplierName: "Seriti Resources (Woestalleen Colliery)",
        product: "High-Grade Magnetite Iron Ore 64% Fe",
        stockpile: "Stockpile 2 (Pit 1 North)",
        notes: "Heavy industrial export batch",
        estimatedMassKg: 350000,
        status: OrderStatus.ACTIVE,
        createdById: admin.id,
      },
    }),
    await prisma.weighbridgeOrder.create({
      data: {
        orderNumber: `ORD-${now.getFullYear()}-00003`,
        type: OrderType.RECEIPT,
        siteId: site.id,
        originSiteId: secondSite.id,
        destinationSiteId: site.id,
        customerName: "Woestalleen Processing Plant",
        supplierName: "Dwarsrivier Chrome Mining (Pty) Ltd",
        product: "Washed Metallurgical Chrome Ore 42%",
        stockpile: "Stockpile 3 (ROM-B)",
        notes: "Inbound blend feed raw stock",
        estimatedMassKg: 400000,
        status: OrderStatus.ACTIVE,
        createdById: admin.id,
      },
    }),
    await prisma.weighbridgeOrder.create({
      data: {
        orderNumber: `ORD-${now.getFullYear()}-00004`,
        type: OrderType.DISPATCH,
        siteId: site.id,
        originSiteId: site.id,
        customerName: "Kendal Power Station (Eskom)",
        supplierName: "Seriti Resources (Woestalleen Colliery)",
        product: "Eskom Grade Coal (4800 kcal/kg)",
        stockpile: "Stockpile 4 (Eskom Feed)",
        notes: "Direct Eskom power grid supply",
        estimatedMassKg: 600000,
        status: OrderStatus.ACTIVE,
        createdById: admin.id,
      },
    }),
  ];

  const bookings = [];
  for (let i = 0; i < 8; i += 1) {
    const status = BookingStatus.PENDING;
    const assignedOrder = orders[i % orders.length]!;
    bookings.push(await prisma.booking.create({
      data: {
        reference: `BK-${now.getFullYear()}-${String(i + 1).padStart(5, "0")}`,
        journeyToken: `JT-${randomUUID().slice(0, 8).toUpperCase()}`,
        transporterOrganisationId: haulier.id,
        siteId: site.id,
        orderId: assignedOrder.id,
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
        approvedById: null,
        approvedAt: null,
        approvalReason: null,
      },
    }));
  }

  // Two approved bookings for the dual-lane site (EX-OO1) — one per lane, so
  // a live daemon pointed at config.dual.docker.yaml has a real truck to
  // check in on each independent deck.
  const dualSiteOrder = await prisma.weighbridgeOrder.create({
    data: {
      orderNumber: `ORD-${now.getFullYear()}-EX001`,
      type: OrderType.DISPATCH,
      siteId: secondSite.id,
      originSiteId: secondSite.id,
      customerName: "Richards Bay Coal Terminal (RBCT)",
      supplierName: "Exxaro Resources (Leeuwpan Colliery)",
      product: "High-Grade Export Coal (RB1 6000 kcal/kg)",
      stockpile: "Stockpile 1 (ROM-East)",
      notes: "Dual-lane rapid dispatch consignment",
      estimatedMassKg: 800000,
      status: OrderStatus.ACTIVE,
      createdById: admin.id,
    },
  });

  const dualSiteBookings = [];
  for (let i = 0; i < 2; i += 1) {
    dualSiteBookings.push(await prisma.booking.create({
      data: {
        reference: `BK-${now.getFullYear()}-EX${String(i + 1).padStart(4, "0")}`,
        journeyToken: `JT-${randomUUID().slice(0, 8).toUpperCase()}`,
        transporterOrganisationId: haulier.id,
        siteId: secondSite.id,
        orderId: dualSiteOrder.id,
        vehicleId: vehicles[8 + i]!.id,
        trailerId: trailers[(8 + i) % trailers.length]!.id,
        driverId: drivers[(8 + i) % drivers.length]!.id,
        commodity: "COAL",
        commodityDescription: "Thermal coal",
        targetTonnageKg: 40000,
        windowStart: new Date(now.getTime() - 60 * 60 * 1000),
        windowEnd: new Date(now.getTime() + 8 * 60 * 60 * 1000),
        status: BookingStatus.APPROVED,
        createdById: transporter.id,
        approvedById: admin.id,
        approvedAt: new Date(now.getTime() - 60 * 60 * 1000),
        approvalReason: "Auto-approved: all compliance checks passed",
      },
    }));
  }

  // Completed historical bookings so the 5 live bookings remain in the arrival queue
  const historicalBookings = [];
  for (let i = 0; i < 16; i += 1) {
    const assignedOrder = orders[i % orders.length]!;
    const v = vehicles[i % vehicles.length]!;
    const t = trailers[i % trailers.length]!;
    const d = drivers[i % drivers.length]!;
    historicalBookings.push(await prisma.booking.create({
      data: {
        reference: `BK-${now.getFullYear()}-H${String(i + 1).padStart(4, "0")}`,
        journeyToken: `JT-${randomUUID().slice(0, 8).toUpperCase()}`,
        transporterOrganisationId: haulier.id,
        siteId: site.id,
        orderId: assignedOrder.id,
        vehicleId: v.id,
        trailerId: t.id,
        driverId: d.id,
        commodity: assignedOrder.product,
        commodityDescription: "Export grade mineral consignment",
        targetTonnageKg: 36000 + (i % 5) * 500,
        windowStart: new Date(now.getTime() - (7 - (i % 7)) * 24 * 60 * 60 * 1000),
        windowEnd: new Date(now.getTime() - (7 - (i % 7)) * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000),
        status: BookingStatus.COMPLETED,
        createdById: transporter.id,
        approvedById: admin.id,
        approvedAt: new Date(now.getTime() - (7 - (i % 7)) * 24 * 60 * 60 * 1000),
        approvalReason: "Auto-approved: all compliance checks passed",
      },
    }));
  }

  let previousHash = "0".repeat(64);
  const transactions = [];
  for (let i = 0; i < 16; i += 1) {
    const booking = historicalBookings[i]!;
    const vehicle = vehicles[i % vehicles.length]!;
    const driver = drivers[i % drivers.length]!;
    const gross = vehicle.tareWeightKg + 32500 + (i % 6) * 450;
    const net = gross - vehicle.tareWeightKg;
    
    // Spread 6 transactions today (within the last 6 hours) and 10 across the past 6 days
    let capturedAt: Date;
    if (i >= 10) {
      // Today: 45 min, 1.5 hr, 2.5 hr, 3.5 hr, 4.5 hr, 5.5 hr ago
      const hoursAgo = 0.75 + (15 - i) * 0.9;
      capturedAt = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    } else {
      // Past 6 days
      capturedAt = new Date(now.getTime() - (6 - Math.floor(i / 2)) * 24 * 60 * 60 * 1000 - (i % 5) * 2 * 60 * 60 * 1000);
    }

    const integrityHash = sha(JSON.stringify({ bookingId: booking.id, gross, net, capturedAt: capturedAt.toISOString(), previousHash }));
    transactions.push(await prisma.weighbridgeTransaction.create({
      data: {
        edgeTransactionId: `EDGE-SEED-${String(i + 1).padStart(5, "0")}`,
        bookingId: booking.id,
        vehicleId: vehicle.id,
        trailerId: booking.trailerId,
        driverId: driver.id,
        siteId: booking.siteId,
        operatorId: i % 2 === 0 ? operator.id : null,
        grossWeightKg: gross,
        tareWeightKg: vehicle.tareWeightKg,
        netWeightKg: net,
        commodity: booking.commodity,
        overload: false,
        overloadVarianceKg: 0,
        anprConfidence: 0.94,
        entryPhotoUrl: `/seed/evidence/entry-${(i % 5) + 1}.jpg`,
        scalePhotoUrl: `/seed/evidence/scale-${(i % 5) + 1}.jpg`,
        waybillNumber: waybill(site.code, i + 1),
        confirmationHash: sha(`cloud-confirmation-${i}`),
        previousHash,
        integrityHash,
        entryAt: new Date(capturedAt.getTime() - 14 * 60 * 1000),
        capturedAt,
        exitAt: new Date(capturedAt.getTime() + 6 * 60 * 1000),
        turnaroundSeconds: 20 * 60,
      },
    }));
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

  // --- RBAC: permission catalogue + built-in roles (see packages/database/src/rbac-catalogue.ts) ---
  const permissionRows = [];
  for (const p of PERMISSION_CATALOGUE) {
    permissionRows.push(await prisma.permission.create({ data: p }));
  }
  const permissionByKey = new Map(permissionRows.map((p) => [p.key, p]));
  const builtInRoles = new Map<string, Awaited<ReturnType<typeof prisma.role.create>>>();
  for (const [roleName, keys] of Object.entries(BUILT_IN_ROLE_PERMISSIONS)) {
    const grantedKeys = keys === null ? PERMISSION_CATALOGUE.map((p) => p.key) : keys;
    const role = await prisma.role.create({ data: { organisationId: null, name: roleName, isBuiltIn: true } });
    await prisma.rolePermission.createMany({ data: grantedKeys.map((key) => ({ roleId: role.id, permissionId: permissionByKey.get(key)!.id })) });
    builtInRoles.set(roleName, role);
  }
  // One custom role scoped to a single client, demonstrating a Client Admin
  // building their own role beyond the four built-ins.
  const yardSupervisorRole = await prisma.role.create({ data: { organisationId: mine.id, name: "Yard Supervisor", isBuiltIn: false } });
  await prisma.rolePermission.createMany({ data: ["booking.view", "booking.approve", "incident.view", "incident.resolve"].map((key) => ({ roleId: yardSupervisorRole.id, permissionId: permissionByKey.get(key)!.id })) });

  await prisma.userRoleAssignment.create({ data: { userId: mineAdmin.id, roleId: builtInRoles.get("CLIENT_ADMIN")!.id } });
  await prisma.userRoleAssignment.create({ data: { userId: supervisor.id, roleId: builtInRoles.get("SUPERVISOR")!.id } });
  await prisma.userRoleAssignment.create({ data: { userId: operator.id, roleId: builtInRoles.get("OPERATOR")!.id } });
  await prisma.userRoleAssignment.create({ data: { userId: viewer.id, roleId: builtInRoles.get("VIEWER")!.id } });
  await prisma.userRoleAssignment.create({ data: { userId: customRoleUser.id, roleId: yardSupervisorRole.id } });
  await prisma.userRoleAssignment.create({ data: { userId: suspendedUser.id, roleId: builtInRoles.get("OPERATOR")!.id } });
  await prisma.userRoleAssignment.create({ data: { userId: clientBAdmin.id, roleId: builtInRoles.get("CLIENT_ADMIN")!.id } });
  // Site-level restriction example: the viewer account can only see Woestalleen, not Exxaro.
  await prisma.userSiteAccess.create({ data: { userId: viewer.id, siteId: site.id } });

  // --- Vehicle-transporter subcontracting: Coal in Motion is authorised to book a Treadstone-owned vehicle ---
  await prisma.vehicleTransporterAssignment.create({
    data: {
      vehicleId: vehicles[0]!.id,
      transporterOrganisationId: coalInMotion.id,
      relationshipType: "SUBCONTRACTOR",
      contractReference: "CTR-2026-0007",
      notes: "Coal in Motion covers Treadstone's overflow capacity on the Woestalleen route.",
      createdById: admin.id,
    },
  });

  // --- Service orders across the status lifecycle ---
  const soDate = now.toISOString().slice(0, 10).replaceAll("-", "");
  await prisma.serviceOrder.create({ data: {
    orderNumber: `SO-${mine.code}-${soDate}-0001`, organisationId: mine.id, siteId: site.id,
    title: "ANPR camera offline at north gate", description: "Camera stopped responding after a power outage overnight.",
    category: "ANPR", priority: "HIGH", status: "OPEN", source: "CLIENT_USER", createdById: mineAdmin.id,
  } });
  await prisma.serviceOrder.create({ data: {
    orderNumber: `SO-${mine.code}-${soDate}-0002`, organisationId: mine.id, siteId: site.id,
    title: "Quarterly scale calibration", description: "Routine NRCS-accredited calibration due before certificate expiry.",
    category: "CALIBRATION", priority: "MEDIUM", status: "IN_PROGRESS", source: "PLATFORM_ADMIN", createdById: admin.id, assignedToId: admin.id, acknowledgedAt: now, startedAt: now,
  } });
  const resolvedSo = await prisma.serviceOrder.create({ data: {
    orderNumber: `SO-${mine.code}-${soDate}-0003`, organisationId: mine.id, siteId: site.id,
    title: "Printer out of thermal paper", description: "Gate printer at the security office ran out of paper.",
    category: "PRINTER", priority: "LOW", status: "RESOLVED", source: "CLIENT_USER", createdById: security.id, assignedToId: mineAdmin.id,
    acknowledgedAt: new Date(now.getTime() - 2 * DAY), startedAt: new Date(now.getTime() - 2 * DAY), resolvedAt: new Date(now.getTime() - 1 * DAY),
    resolutionNotes: "Replacement paper roll delivered and installed.",
  } });
  await prisma.serviceOrderComment.create({ data: { serviceOrderId: resolvedSo.id, authorId: mineAdmin.id, body: "Confirmed fixed on-site, printer tested with a sample waybill." } });

  // --- Print/reprint audit trail example ---
  const printedTransaction = transactions[0]!;
  await prisma.weighbridgeTransaction.update({ where: { id: printedTransaction.id }, data: { printedAt: now, printCount: 3, lastPrintedById: operator.id } });
  for (const copy of ["CLIENT", "DRIVER", "SECURITY"]) {
    await prisma.systemLog.create({ data: { userId: operator.id, siteId: site.id, action: "TRANSACTION_PRINTED", entityType: "weighbridge_transaction", entityId: printedTransaction.id, afterData: { copy, printCount: 3 } } });
  }

  // --- Client B Specific Data ---
  const bVehicle = await prisma.vehicle.create({
    data: {
      organisationId: clientB.id,
      plate: "BB 123 BB GP",
      plateNormalized: normalisePlate("BB 123 BB GP"),
      make: "Mercedes",
      model: "Actros",
      year: 2020,
      vin: `VINZB1234567890`,
      tareWeightKg: 15000,
      legalMaxGvwKg: 50000,
      insuranceExpiry: new Date(now.getTime() + 100 * DAY),
    },
  });

  const bDriver = await prisma.driver.create({
    data: {
      organisationId: clientB.id,
      firstName: "John",
      lastName: "Doe",
      idNumberEncrypted: encryptSensitive("9001015000080"),
      idNumberHash: sensitiveHash("9001015000080"),
      rfidTag: `DRVB01`,
      licenceNumber: `ZA-DL-B001`,
      licenceExpiry: new Date(now.getTime() + 200 * DAY),
      consentCapturedAt: new Date(now.getTime() - 10 * DAY),
    },
  });

  const bTrailer = await prisma.trailer.create({ data: { vehicleId: bVehicle.id, trailerId: `TRL-B001`, registrationNo: `TR BB GP`, type: "Flatbed", tareWeightKg: 5000 } });

  const bBooking = await prisma.booking.create({
    data: {
      reference: `BK-${now.getFullYear()}-B001`,
      journeyToken: `JT-${randomUUID().slice(0, 8).toUpperCase()}`,
      transporterOrganisationId: clientB.id,
      siteId: siteB.id,
      vehicleId: bVehicle.id,
      trailerId: bTrailer.id,
      driverId: bDriver.id,
      commodity: "COAL",
      commodityDescription: "Thermal coal B",
      targetTonnageKg: 30000,
      windowStart: new Date(now.getTime() - 60 * 60 * 1000),
      windowEnd: new Date(now.getTime() + 6 * 60 * 60 * 1000),
      status: BookingStatus.APPROVED,
      createdById: clientBAdmin.id,
      approvedById: clientBAdmin.id,
      approvedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      approvalReason: "Approved",
    },
  });

  const bTransaction = await prisma.weighbridgeTransaction.create({
    data: {
      edgeTransactionId: `EDGE-B-001`,
      bookingId: bBooking.id,
      vehicleId: bVehicle.id,
      trailerId: bBooking.trailerId,
      driverId: bDriver.id,
      siteId: bBooking.siteId,
      operatorId: null,
      grossWeightKg: 45000,
      tareWeightKg: 15000,
      netWeightKg: 30000,
      commodity: bBooking.commodity,
      overload: false,
      overloadVarianceKg: 0,
      anprConfidence: 0.90,
      waybillNumber: waybill(siteB.code, 1),
      confirmationHash: sha(`cloud-confirmation-b`),
      previousHash: "0".repeat(64),
      integrityHash: sha(`b-hash`),
      entryAt: new Date(now.getTime() - 20 * 60 * 1000),
      capturedAt: now,
      exitAt: new Date(now.getTime() + 5 * 60 * 1000),
      turnaroundSeconds: 25 * 60,
    },
  });

  await prisma.serviceOrder.create({ data: {
    orderNumber: `SO-${clientB.code}-${soDate}-0001`, organisationId: clientB.id, siteId: siteB.id,
    title: "Site B Issue", description: "Issue at Site B.",
    category: "OTHER", priority: "MEDIUM", status: "OPEN", source: "CLIENT_USER", createdById: clientBAdmin.id,
  } });
  
  await prisma.hardwareDevice.create({
    data: {
      siteId: siteB.id,
      deviceKey: "SCALE-B",
      name: "Site B Weighbridge",
      type: "SCALE",
      serialNumber: "WB-B-0001",
      firmwareVersion: "1.0.0",
      statuses: { create: { siteId: siteB.id, health: "ONLINE", lastSeen: now, sensorReadings: {}, connectivity: {} } },
    },
  });

  console.log("Seed complete.");
  console.log("Demo users (all password: Password123!):");
  console.log("  admin@weighbridge.local       — platform super-admin (all clients)");
  console.log("  mine-admin@weighbridge.local  — Seriti Resources admin (CLIENT_ADMIN)");
  console.log("  supervisor@weighbridge.local  — Seriti Resources supervisor (SUPERVISOR)");
  console.log("  operator@weighbridge.local    — Seriti Resources operator (OPERATOR)");
  console.log("  security@weighbridge.local    — Seriti Resources security");
  console.log("  viewer@weighbridge.local      — Seriti Resources viewer (VIEWER, Wolvekrans-Middelburg site only)");
  console.log("  custom@weighbridge.local      — Seriti Resources custom role (Yard Supervisor)");
  console.log("  suspended@weighbridge.local   — Seriti Resources suspended user");
  console.log("  transporter@weighbridge.local — SG Coal transporter");
  console.log("  clientb-admin@weighbridge.local — Client B administrator");
  console.log("  For all other companies, use admin@[company-code].local, supervisor@[company-code].local, etc.");
  console.log("  For transporters, use transporter@[company-code].local");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
