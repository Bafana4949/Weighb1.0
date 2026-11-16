/**
 * Prove an RFID tag resolves to the right driver/truck and its order booking.
 *
 * Usage (from repo root):
 *   node scripts/verify-tag.mjs                 # live-scan one card via the NFC bridge
 *   node scripts/verify-tag.mjs 34981DEB        # verify a specific UID
 *   node scripts/verify-tag.mjs 34981DEB 5701A941   # verify several (e.g. driver + truck)
 *
 * Needs: the app DB (apps/web/.env DATABASE_URL) and, for live scan, the NFC
 * bridge running (`npm run nfc-bridge`).
 */
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config({ path: "apps/web/.env" });

const BRIDGE = process.env.NFC_BRIDGE_URL || "http://127.0.0.1:7777";
const prisma = new PrismaClient();

const normalizeUid = (s) => (s || "").toUpperCase().replace(/[^0-9A-F]/g, "");
const ACTIVE_BOOKING = ["PENDING", "APPROVED", "ACTIVE"];

async function scanOnce() {
  process.stdout.write("Tap a card on the reader... ");
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BRIDGE}/uid?timeout=3000`, { cache: "no-store" });
      if (r.status === 200) {
        const b = await r.json();
        console.log(`got ${b.uid}`);
        return b.uid;
      }
    } catch (_e) {
      console.log("\n  (can't reach the NFC bridge — is `npm run nfc-bridge` running?)");
      return null;
    }
  }
  console.log("no card.");
  return null;
}

async function verify(rawUid) {
  const uid = normalizeUid(rawUid);
  console.log(`\n── Tag ${uid} ──────────────────────────────`);

  const cred = await prisma.rfidCredential.findUnique({
    where: { uid },
    include: { driver: true, vehicle: true, organisation: true },
  });

  if (!cred) {
    console.log(`  ✗ NOT REGISTERED. No RFID credential has UID ${uid}.`);
    console.log(`    Issue it at /admin/hardware/rfid → Issue New RFID → Scan card.`);
    return false;
  }

  const who = cred.credentialType === "DRIVER"
    ? `Driver ${cred.driver?.firstName} ${cred.driver?.lastName}`
    : `Truck ${cred.vehicle?.plate}`;
  console.log(`  ✓ Registered: ${who}  [${cred.organisation?.name}]  status=${cred.status}`);

  // find bookings this entity is on
  const where = cred.credentialType === "DRIVER"
    ? { driverId: cred.driverId }
    : { vehicleId: cred.vehicleId };
  const bookings = await prisma.booking.findMany({
    where,
    include: { order: true, vehicle: true, driver: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const active = bookings.filter((b) => ACTIVE_BOOKING.includes(b.status));
  if (active.length) {
    for (const b of active) {
      console.log(`  ✓ On live booking ${b.journeyToken} (${b.status})`);
      console.log(`      order:  ${b.order?.orderNumber ?? "(walk-in)"}  ${b.order ? "["+b.order.status+"] "+(b.order.product||"") : ""}`);
      console.log(`      truck:  ${b.vehicle?.plate}`);
      console.log(`      driver: ${b.driver?.firstName} ${b.driver?.lastName}`);
    }
  } else if (bookings.length) {
    console.log(`  • No live booking right now (last: ${bookings[0].journeyToken} ${bookings[0].status}, order ${bookings[0].order?.orderNumber}).`);
    console.log(`    Assign this ${cred.credentialType.toLowerCase()} to an ACTIVE order to see a live match.`);
  } else {
    console.log(`  • Registered, but not assigned to any order yet.`);
  }
  return { cred, active };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Continuous gate demo: tap cards and watch each one get recognised. */
async function watch() {
  console.log("═══════════════════════════════════════════");
  console.log(" WEIGHBRIDGE GATE — tap a card on the reader");
  console.log(" (Ctrl+C to stop)");
  console.log("═══════════════════════════════════════════");
  let last = "", lastT = 0;
  for (;;) {
    let uid = null;
    try {
      const r = await fetch(`${BRIDGE}/uid?timeout=3000`, { cache: "no-store" });
      if (r.status === 200) uid = (await r.json()).uid;
    } catch (_e) {
      console.log("  (NFC bridge not reachable — run `npm run nfc-bridge`)");
      await sleep(2000);
      continue;
    }
    if (uid) {
      const now = Date.now();
      if (uid !== last || now - lastT > 4000) { await verify(uid); last = uid; lastT = now; }
    }
  }
}

async function main() {
  if (process.argv.includes("--watch")) { await watch(); return; }
  let uids = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (uids.length === 0) {
    const u = await scanOnce();
    if (u) uids = [u];
  }
  if (uids.length === 0) { await prisma.$disconnect(); process.exit(1); }

  const results = [];
  for (const u of uids) results.push(await verify(u));

  // cross-check: if a driver tag and a truck tag share the same live booking
  const driverHit = results.find((r) => r && r.cred?.credentialType === "DRIVER");
  const truckHit = results.find((r) => r && r.cred?.credentialType === "TRUCK");
  if (driverHit?.active?.length && truckHit?.active?.length) {
    const shared = driverHit.active.find((d) => truckHit.active.some((t) => t.journeyToken === d.journeyToken));
    console.log("\n──────────────────────────────────────────");
    if (shared) {
      console.log(`✅ PROVEN: both tags resolve to the SAME live booking ${shared.journeyToken}`);
      console.log(`   ${driverHit.cred.driver.firstName} ${driverHit.cred.driver.lastName} driving ${truckHit.cred.vehicle.plate} on order ${shared.order?.orderNumber}.`);
    } else {
      console.log(`⚠️  Driver and truck tags are both live, but on different bookings — assign them together on one order.`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
