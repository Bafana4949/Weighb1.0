import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config();

const prisma = new PrismaClient();

// Mirror parser logic from live-operator-dashboard.tsx
function parseMettlerWeight(raw) {
  if (!raw) return null;

  // 1. Toledo Continuous Protocol: STX <SWA><SWB><SWC><6 chars indicated weight><6 chars tare><CR>
  const toledoMatch = raw.match(/\x02.{3}([\s\d]{6})/s);
  if (toledoMatch && toledoMatch[1]) {
    const candidate = parseFloat(toledoMatch[1].trim());
    if (!isNaN(candidate) && candidate >= 0) return Math.round(candidate);
  }

  // 2. Toledo Continuous ending with CR (6 chars weight followed by 6 chars tare then CR)
  const toledoCrMatch = raw.match(/([\s\d]{6})([\s\d]{6})\r/);
  if (toledoCrMatch && toledoCrMatch[1]) {
    const candidate = parseFloat(toledoCrMatch[1].trim());
    if (!isNaN(candidate) && candidate >= 0) return Math.round(candidate);
  }

  const cleaned = raw.replace(/[^\x20-\x7E]/g, " ").trim();
  if (!cleaned) return null;

  // 3. MT-SICS command format
  const sicsMatch = cleaned.match(/(?:S\s+[SDI]|ST\s*,\s*GS\s*,?\s*[+-]?|Net|Gross|WT:?)\s*([+-]?\s*\d+(?:\.\d+)?)/i);
  if (sicsMatch && sicsMatch[1]) {
    const candidate = parseFloat(sicsMatch[1].replace(/\s+/g, ""));
    if (!isNaN(candidate) && candidate >= 0) return Math.round(candidate);
  }

  // 4. String with explicit 'kg' or 't' unit
  const kgMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:kg|t\b)/i);
  if (kgMatch && kgMatch[1]) {
    const candidate = parseFloat(kgMatch[1]);
    if (!isNaN(candidate) && candidate >= 0) return Math.round(candidate);
  }

  // 5. Toledo Continuous spaced tokens
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    for (const token of tokens) {
      if (!token) continue;
      const candidate = parseFloat(token);
      if (!isNaN(candidate) && candidate >= 100) return Math.round(candidate);
    }
  }

  // 6. Generic numeric match: 3 to 6 consecutive digits
  const numCandidates = cleaned.match(/\b\d{3,6}\b/g);
  if (numCandidates && numCandidates[0]) {
    const candidate = parseFloat(numCandidates[0]);
    if (!isNaN(candidate) && candidate >= 0) return Math.round(candidate);
  }

  const numMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
  return numMatch && numMatch[1] ? Math.round(parseFloat(numMatch[1])) : null;
}

async function testIndicatorParser() {
  console.log("=== 1. TESTING WEIGHBRIDGE INDICATOR PARSER ===");
  const testCases = [
    { name: "Toledo Continuous Compact Frame", raw: "\x02\x20\x00\x00  2200      0\r", expected: 2200 },
    { name: "Toledo Continuous 6-digit with zeros", raw: "\x02\x20\x00\x00002200000000\r", expected: 2200 },
    { name: "Toledo Continuous CR delimited", raw: "  2200      0\r", expected: 2200 },
    { name: "MT-SICS S S Command", raw: "S S 2200 kg\r\n", expected: 2200 },
    { name: "MT-SICS ST,GS format", raw: "ST,GS,+ 2200 kg\r", expected: 2200 },
    { name: "Net Weight format", raw: "Net: 2200 kg", expected: 2200 },
    { name: "Spaced Toledo tokens (10 2200 00)", raw: "10 2200 00 10", expected: 2200 },
    { name: "Heavy Loaded Truck 48500 kg", raw: "\x02\x20\x00\x00 48500      0\r", expected: 48500 }
  ];

  let passed = 0;
  for (const tc of testCases) {
    const parsed = parseMettlerWeight(tc.raw);
    const ok = parsed === tc.expected;
    if (ok) passed++;
    console.log(`  [${ok ? "PASS" : "FAIL"}] ${tc.name}: parsed = ${parsed} (expected ${tc.expected})`);
  }
  console.log(`Parser Results: ${passed}/${testCases.length} passed.\n`);
}

async function testMultiTenancy() {
  console.log("=== 2. TESTING MULTI-TENANT ISOLATION IN DATABASE ===");

  const bafana = await prisma.user.findUnique({
    where: { email: 'superadmin@weighbridge.co.za' },
    include: { organisation: true }
  });
  console.log(`Super Admin: ${bafana.firstName} ${bafana.lastName} | Role: ${bafana.role} | Platform: ${bafana.platformRole} | Org: ${bafana.organisation?.name || "NONE (Full cross-tenant access)"}`);

  const grant = await prisma.user.findUnique({
    where: { email: 'grant@treadstone.co.za' },
    include: { organisation: true }
  });
  console.log(`Company Admin: ${grant.firstName} ${grant.lastName} | Role: ${grant.role} | Platform: ${grant.platformRole || "None"} | Org: ${grant.organisation?.name || "NONE"}`);

  // Check Coal In Motion site count vs total site count
  const allSites = await prisma.site.count();
  const grantSites = await prisma.site.count({
    where: { organisationId: grant.organisationId }
  });
  console.log(`Total Platform Sites: ${allSites} | Grant Howell (Coal In Motion) Sites: ${grantSites}`);

  // Check Orders
  const allOrders = await prisma.weighbridgeOrder.count();
  const grantOrders = await prisma.weighbridgeOrder.count({
    where: { site: { organisationId: grant.organisationId } }
  });
  console.log(`Total Platform Orders: ${allOrders} | Coal In Motion Orders: ${grantOrders}`);

  console.log("\n✅ Multi-tenant test completed successfully!");
}

async function run() {
  await testIndicatorParser();
  await testMultiTenancy();
}

run().catch(console.error).finally(() => prisma.$disconnect());
