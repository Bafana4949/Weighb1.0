import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { assertOrganisationActive,isPlatformSuperAdmin } from "@/lib/permissions";
import { mineScope } from "@/lib/access";

/**
 * Runs against a real Postgres connection (DATABASE_URL), not a mocked
 * Prisma client. A mocked client can only prove "the code called mineScope";
 * this proves Postgres itself refuses to return another org's row. Creates
 * its own clearly-marked rows and deletes them in afterAll so it never
 * pollutes persistent dev/seed data.
 */
const prisma = new PrismaClient();
const marker = `integration-test-${Date.now()}`;

let orgA: { id: string };
let orgB: { id: string };
let siteA: { id: string };
let siteB: { id: string };
let platformAdminUser: { id: string; role: "ADMIN"; organisationId: string | null; platformRole: "PLATFORM_SUPER_ADMIN" };
let scopedAdminUser: { id: string; role: "ADMIN"; organisationId: string; platformRole: null };

beforeAll(async () => {
  orgA = await prisma.organisation.create({ data: { name: `${marker}-org-a`, type: "MINING_COMPANY" } });
  orgB = await prisma.organisation.create({ data: { name: `${marker}-org-b`, type: "MINING_COMPANY" } });
  siteA = await prisma.site.create({ data: { organisationId: orgA.id, code: `${marker}-SITE-A`, name: "Site A", address: "1 Test Rd", latitude: 0, longitude: 0 } });
  siteB = await prisma.site.create({ data: { organisationId: orgB.id, code: `${marker}-SITE-B`, name: "Site B", address: "2 Test Rd", latitude: 0, longitude: 0 } });
  const platformAdmin = await prisma.user.create({ data: { email: `${marker}-platform-admin@test.local`, passwordHash: "x", firstName: "Platform", lastName: "Admin", role: "ADMIN", organisationId: null, platformRole: "PLATFORM_SUPER_ADMIN" } });
  const scopedAdmin = await prisma.user.create({ data: { email: `${marker}-scoped-admin@test.local`, passwordHash: "x", firstName: "Scoped", lastName: "Admin", role: "ADMIN", organisationId: orgA.id } });
  platformAdminUser = platformAdmin as typeof platformAdminUser;
  scopedAdminUser = scopedAdmin as typeof scopedAdminUser;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: marker } } });
  await prisma.site.deleteMany({ where: { code: { startsWith: marker } } });
  await prisma.organisation.deleteMany({ where: { name: { startsWith: marker } } });
  await prisma.$disconnect();
});

describe("tenant isolation (real database)", () => {
  it("isPlatformSuperAdmin correctly distinguishes a real platform-admin row from a real scoped-admin row", () => {
    expect(isPlatformSuperAdmin(platformAdminUser)).toBe(true);
    expect(isPlatformSuperAdmin(scopedAdminUser)).toBe(false);
  });

  it("a scoped admin's mineScope query only returns their own org's site from Postgres, never the other org's", async () => {
    const sites = await prisma.site.findMany({ where: { code: { startsWith: marker }, ...mineScope(orgA.id) } });
    expect(sites.map((s) => s.id)).toEqual([siteA.id]);
    expect(sites.map((s) => s.id)).not.toContain(siteB.id);
  });

  it("a platform super-admin's unscoped mineScope query sees both orgs' sites", async () => {
    const sites = await prisma.site.findMany({ where: { code: { startsWith: marker }, ...mineScope(null) } });
    const ids = sites.map((s) => s.id).sort();
    expect(ids).toEqual([siteA.id, siteB.id].sort());
  });
});

describe("organisation lifecycle gating (real database)", () => {
  it("a SUSPENDED organisation fetched from Postgres is rejected by assertOrganisationActive", async () => {
    const suspended = await prisma.organisation.create({ data: { name: `${marker}-suspended-org`, type: "MINING_COMPANY", status: "SUSPENDED", suspendedAt: new Date(), suspensionReason: "non-payment" } });
    const fetched = await prisma.organisation.findUniqueOrThrow({ where: { id: suspended.id } });
    expect(assertOrganisationActive(fetched)).toMatch(/suspended/i);
    await prisma.organisation.delete({ where: { id: suspended.id } });
  });

  it("an ACTIVE organisation fetched from Postgres is allowed by assertOrganisationActive", async () => {
    const fetched = await prisma.organisation.findUniqueOrThrow({ where: { id: orgA.id } });
    expect(assertOrganisationActive(fetched)).toBeNull();
  });

  it("a Lane belongs to exactly one site and is not returned for the other org's site", async () => {
    const lane = await prisma.lane.create({ data: { siteId: siteA.id, laneNumber: 1, name: `${marker}-lane`, direction: "ENTRY" } });
    const lanesForSiteA = await prisma.lane.findMany({ where: { siteId: siteA.id } });
    const lanesForSiteB = await prisma.lane.findMany({ where: { siteId: siteB.id } });
    expect(lanesForSiteA.map((l) => l.id)).toContain(lane.id);
    expect(lanesForSiteB.map((l) => l.id)).not.toContain(lane.id);
  });
});
