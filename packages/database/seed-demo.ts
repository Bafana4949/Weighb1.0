/**
 * Demo / training dataset: three fictional companies, one per commercial tier, with
 * sites, lanes, hardware from the built-in templates, users for every persona,
 * transporters, products, orders and a week of hash-chained transactions.
 *
 * SAFETY: refuses to run unless the target database name contains "demo".
 *   DATABASE_URL=postgresql://.../weighbridge_demo DEMO_PASSWORD='...' npx tsx seed-demo.ts
 */
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient, type OperatingTier } from "@prisma/client";
import { computeIntegrityHash } from "../../apps/web/src/lib/chain";
import { BUILT_IN_PROFILES } from "../../apps/web/src/lib/hardware-profiles";
import { PERMISSION_CATALOGUE, BUILT_IN_ROLE_PERMISSIONS } from "./src/rbac-catalogue";

const url = process.env.DATABASE_URL ?? "";
const dbName = url.split("/").pop()?.split("?")[0] ?? "";
if (!/demo/i.test(dbName)) {
  console.error(`Refusing to seed demo data into "${dbName}". The database name must contain "demo".`);
  process.exit(1);
}
const prisma = new PrismaClient();
const PASSWORD = process.env.DEMO_PASSWORD ?? randomBytes(9).toString("base64url");
const DAY = 24 * 3600 * 1000;
let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(++seq).toString(36)}`;

type CompanySpec = {
  name: string; code: string; licensedTier: OperatingTier; domain: string;
  products: string[];
  sites: { code: string; name: string; tier: OperatingTier; lanes: number; topology: "BIDIRECTIONAL_SINGLE" | "DUAL_ENTRY_EXIT"; profile: string; address: string; lat: number; lng: number }[];
};

const COMPANIES: CompanySpec[] = [
  { name: "Ridgeback Aggregates", code: "RIDGEBACK", licensedTier: "MANUAL", domain: "ridgeback.demo", products: ["G1 Crushed Stone 19mm", "River Sand", "Road Base G5"],
    sites: [{ code: "RBQ-01", name: "Ridgeback Quarry", tier: "MANUAL", lanes: 1, topology: "BIDIRECTIONAL_SINGLE", profile: "builtin-manual", address: "R512, Brits, North West", lat: -25.63, lng: 27.78 }] },
  { name: "Highveld Coal Logistics", code: "HIGHVELD", licensedTier: "SEMI_AUTOMATIC", domain: "highveldcoal.demo", products: ["RB1 Export Coal", "RB3 Thermal Coal", "Duff"],
    sites: [
      { code: "HCL-P3", name: "Highveld Pit 3", tier: "SEMI_AUTOMATIC", lanes: 1, topology: "BIDIRECTIONAL_SINGLE", profile: "builtin-semi", address: "N12, eMalahleni, Mpumalanga", lat: -25.87, lng: 29.23 },
      { code: "HCL-RS", name: "Highveld Rail Siding", tier: "MANUAL", lanes: 1, topology: "BIDIRECTIONAL_SINGLE", profile: "builtin-manual", address: "Ogies, Mpumalanga", lat: -26.05, lng: 29.06 },
    ] },
  { name: "Mopane Minerals", code: "MOPANE", licensedTier: "FULLY_AUTOMATIC", domain: "mopane.demo", products: ["Chrome Concentrate 42%", "Manganese Ore", "Chrome ROM"],
    sites: [
      { code: "MOP-N", name: "Mopane North Plant", tier: "FULLY_AUTOMATIC", lanes: 2, topology: "DUAL_ENTRY_EXIT", profile: "builtin-full", address: "R37, Burgersfort, Limpopo", lat: -24.67, lng: 30.32 },
      { code: "MOP-D", name: "Mopane Export Depot", tier: "SEMI_AUTOMATIC", lanes: 1, topology: "BIDIRECTIONAL_SINGLE", profile: "builtin-semi", address: "Steelpoort, Limpopo", lat: -24.73, lng: 30.2 },
    ] },
];

const HAULIERS = ["Swift Haul Transport", "Bushveld Freight", "Limpopo Bulk Carriers"];
const FIRST = ["Thabo", "Sipho", "Johan", "Lerato", "Pieter", "Nomsa", "Kagiso", "Andile", "Ruan", "Zanele", "Tshepo", "Bongani"];
const LAST = ["Mokoena", "Dlamini", "van Wyk", "Nkosi", "Botha", "Khumalo", "Molefe", "Naidoo", "Pretorius", "Mahlangu", "Sithole", "Ndlovu"];

async function main() {
  console.log(`Seeding demo data into ${dbName} ...`);
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // RBAC catalogue (same as production seed)
  const perms = await Promise.all(PERMISSION_CATALOGUE.map((p) => prisma.permission.upsert({ where: { key: p.key }, update: {}, create: p })));
  for (const [roleName, keys] of Object.entries(BUILT_IN_ROLE_PERMISSIONS)) {
    const role = (await prisma.role.findFirst({ where: { name: roleName, organisationId: null } })) ?? (await prisma.role.create({ data: { name: roleName, isBuiltIn: true } }));
    const grant = keys === null ? perms : perms.filter((p) => keys.includes(p.key));
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: grant.map((p) => ({ roleId: role.id, permissionId: p.id })) });
  }

  const superAdmin = await prisma.user.upsert({
    where: { email: "platform.admin@weighbridge.demo" },
    update: { passwordHash },
    create: { email: "platform.admin@weighbridge.demo", firstName: "Platform", lastName: "Administrator", role: "ADMIN", platformRole: "PLATFORM_SUPER_ADMIN", passwordHash },
  });

  const hauliers = [];
  for (const name of HAULIERS) {
    hauliers.push(await prisma.organisation.create({ data: { name, type: "HAULIER", status: "ACTIVE", contactEmail: `dispatch@${name.split(" ")[0]!.toLowerCase()}.demo` } }));
  }
  await prisma.user.create({ data: { email: "dispatch@swift.demo", firstName: "Naledi", lastName: "Mokoena", role: "TRANSPORTER", organisationId: hauliers[0]!.id, passwordHash } });

  // Fleet per haulier
  const fleet: { vehicleId: string; plate: string; tare: number; driverId: string; orgId: string }[] = [];
  let n = 0;
  for (const h of hauliers) {
    for (let i = 0; i < 4; i++, n++) {
      const plate = `${["JHB", "MP", "LP", "NW"][n % 4]} ${String(100 + n * 7).padStart(3, "0")}-${["GP", "MP", "LP", "NW"][(n + 1) % 4]}`;
      const tare = 14200 + (n % 5) * 450;
      const v = await prisma.vehicle.create({ data: { organisationId: h.id, plate, plateNormalized: plate.replace(/[^A-Z0-9]/g, ""), make: ["Volvo", "Scania", "MAN", "Mercedes-Benz"][n % 4]!, model: ["FH 440", "R 460", "TGS 26.440", "Actros 2645"][n % 4]!, tareWeightKg: tare, legalMaxGvwKg: 56000, insuranceExpiry: new Date(Date.now() + 200 * DAY) } });
      const d = await prisma.driver.create({ data: { organisationId: h.id, firstName: FIRST[n % FIRST.length]!, lastName: LAST[n % LAST.length]!, idNumberEncrypted: "DEMO", idNumberHash: createHash("sha256").update(`demo-driver-${n}-${Date.now()}`).digest("hex"), licenceNumber: `DEMO-LIC-${1000 + n}-${Date.now() % 10000}`, licenceExpiry: new Date(Date.now() + 400 * DAY), consentCapturedAt: new Date() } });
      fleet.push({ vehicleId: v.id, plate, tare, driverId: d.id, orgId: h.id });
    }
  }

  for (const [ci, spec] of COMPANIES.entries()) {
    const company = await prisma.organisation.create({ data: { name: spec.name, code: `${spec.code}-${Date.now() % 1000}`, type: "MINING_COMPANY", status: "ACTIVE", licensedTier: spec.licensedTier, contactEmail: `info@${spec.domain}`, onboardedAt: new Date(), onboardedById: superAdmin.id } });
    for (const h of hauliers) await prisma.miningCompanyTransporter.create({ data: { miningCompanyId: company.id, transporterId: h.id } });
    const products = [];
    for (const [pi, p] of spec.products.entries()) products.push(await prisma.product.create({ data: { organisationId: company.id, name: p, code: `${spec.code.slice(0, 3)}-P${pi + 1}`, category: ci === 0 ? "Aggregate" : ci === 1 ? "Coal" : "Ore", createdByUserId: superAdmin.id } }));
    await prisma.user.create({ data: { email: `admin@${spec.domain}`, firstName: FIRST[ci + 3]!, lastName: LAST[ci + 3]!, role: "ADMIN", organisationId: company.id, passwordHash } });

    for (const [si, s] of spec.sites.entries()) {
      const site = await prisma.site.create({
        data: {
          organisationId: company.id, code: s.code, name: s.name, address: s.address, latitude: s.lat, longitude: s.lng, topology: s.topology, operatingTier: s.tier,
          config: { create: { allowedWorkflows: ["DISPATCH", "RECEIPT"] } },
          lanes: { create: Array.from({ length: s.lanes }, (_, i) => ({ laneNumber: i + 1, name: s.topology === "DUAL_ENTRY_EXIT" ? (i === 0 ? "Entry lane" : "Exit lane") : "Weighbridge 1", direction: s.topology === "DUAL_ENTRY_EXIT" ? (i === 0 ? "ENTRY" : "EXIT") : null })) },
        },
        include: { lanes: true },
      });
      // Hardware from the built-in template; site-specific addresses filled with LAN examples.
      const profile = BUILT_IN_PROFILES.find((p) => p.id === s.profile)!;
      for (const [di, d] of profile.devices.entries()) {
        const needsHost = ["TCP_IP"].includes(d.connectionType);
        await prisma.hardwareDevice.create({ data: { siteId: site.id, laneId: site.lanes.find((l) => l.laneNumber === d.laneNumber)?.id ?? null, type: d.type, deviceKey: d.deviceKey, name: d.name, connectionType: d.connectionType, configuration: { ...(d.configuration ?? {}), ...(needsHost ? { host: `10.${20 + ci}.${si + 1}.${40 + di}` } : {}) }, manufacturer: d.type === "SCALE" ? "Mettler Toledo" : null, model: d.type === "SCALE" ? "IND570" : null } });
      }
      // Site staff: site admin and operator restricted to this site.
      const siteAdmin = await prisma.user.create({ data: { email: `siteadmin.${s.code.toLowerCase()}@${spec.domain}`, firstName: FIRST[(ci + si + 6) % FIRST.length]!, lastName: LAST[(ci + si + 2) % LAST.length]!, role: "ADMIN", organisationId: company.id, passwordHash } });
      const operator = await prisma.user.create({ data: { email: `operator.${s.code.toLowerCase()}@${spec.domain}`, firstName: FIRST[(ci + si + 8) % FIRST.length]!, lastName: LAST[(ci + si + 5) % LAST.length]!, role: "OPERATOR", organisationId: company.id, passwordHash } });
      const guard = await prisma.user.create({ data: { email: `security.${s.code.toLowerCase()}@${spec.domain}`, firstName: FIRST[(ci + si + 10) % FIRST.length]!, lastName: LAST[(ci + si + 9) % LAST.length]!, role: "SECURITY", organisationId: company.id, passwordHash } });
      for (const u of [siteAdmin, operator, guard]) await prisma.userSiteAccess.create({ data: { userId: u.id, siteId: site.id } });

      // Orders and a week of completed, hash-chained transactions.
      const orders = [];
      for (const [oi, p] of products.slice(0, 2).entries()) {
        orders.push(await prisma.weighbridgeOrder.create({ data: { orderNumber: `${s.code}-ORD-${oi + 1}`, type: "DISPATCH", siteId: site.id, customerName: ["Coastal Construction", "Richards Bay Export Terminal", "Gauteng Roads Agency"][(ci + oi) % 3], product: p.name, productId: p.id, estimatedMassKg: 2_000_000 + oi * 500_000, createdById: superAdmin.id } }));
      }
      let previousHash = "0".repeat(64);
      let waybillSeq = 0;
      const count = s.tier === "MANUAL" ? 18 : 30;
      for (let t = 0; t < count; t++) {
        const truck = fleet[(t + ci * 3 + si) % fleet.length]!;
        const order = orders[t % orders.length]!;
        const capturedAt = new Date(Date.now() - (count - t) * (7 * DAY / count) - (si * 13 + ci * 7) * 60000);
        const net = 30000 + ((t * 1373 + ci * 911) % 6500);
        const gross = truck.tare + net;
        const booking = await prisma.booking.create({ data: { reference: uid("BK").toUpperCase(), journeyToken: uid("JT").toUpperCase(), transporterOrganisationId: truck.orgId, siteId: site.id, vehicleId: truck.vehicleId, driverId: truck.driverId, orderId: order.id, commodity: order.product, targetTonnageKg: 34000, windowStart: new Date(capturedAt.getTime() - 3600000), windowEnd: new Date(capturedAt.getTime() + 3600000), status: "COMPLETED", approvedAt: capturedAt, createdById: superAdmin.id } });
        const dateStr = capturedAt.toISOString().slice(0, 10).replace(/-/g, "");
        const waybillNumber = `WB-${s.code}-${dateStr}-${String(++waybillSeq).padStart(6, "0")}`;
        const edgeTransactionId = uid("EDGE");
        const integrityHash = computeIntegrityHash({ edgeTransactionId, bookingId: booking.id, vehicleId: truck.vehicleId, driverId: truck.driverId, siteId: site.id, grossWeightKg: gross, tareWeightKg: truck.tare, netWeightKg: net, commodity: order.product, capturedAt, waybillNumber, previousHash });
        await prisma.weighbridgeTransaction.create({ data: {
          edgeTransactionId, bookingId: booking.id, vehicleId: truck.vehicleId, driverId: truck.driverId, siteId: site.id, laneId: site.lanes[0]!.id, operatorId: s.tier === "FULLY_AUTOMATIC" ? null : operator.id,
          grossWeightKg: gross, tareWeightKg: truck.tare, netWeightKg: net, commodity: order.product, waybillNumber, previousHash, integrityHash,
          confirmationHash: createHash("sha256").update(`${integrityHash}:confirm`).digest("hex"), transactionType: "SECOND_WEIGH", status: "COMPLETED",
          entryAt: new Date(capturedAt.getTime() - 22 * 60000), tareCapturedAt: new Date(capturedAt.getTime() - 18 * 60000), grossCapturedAt: capturedAt, capturedAt,
          exitAt: new Date(capturedAt.getTime() + 4 * 60000), turnaroundSeconds: 26 * 60 + (t % 9) * 60,
        } });
        previousHash = integrityHash;
      }
      if (s.tier !== "MANUAL") {
        await prisma.incident.create({ data: { siteId: site.id, type: "MANUAL_OVERRIDE", severity: "MEDIUM", title: "Weight entered by hand", description: "Operator typed the weight instead of reading the indicator. Reason: Indicator offline — reading taken from display" } });
      }
    }
  }

  console.log("\nDemo data ready. All demo accounts share one password:");
  console.log(`  password: ${PASSWORD}`);
  console.log("  platform.admin@weighbridge.demo (Super Admin)");
  console.log("  admin@<company>.demo, siteadmin.<site>@..., operator.<site>@..., security.<site>@..., dispatch@swift.demo");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
