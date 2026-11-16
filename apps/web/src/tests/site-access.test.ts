import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { userSiteAccess: { findMany: (...args: unknown[]) => findMany(...args) } } }));

import { canAccessSite, canViewTransaction, contextAllowsSite, loadAccessContext, roleLabel, siteWhere, viaSiteWhere } from "@/lib/site-access";
import { TenantScopeError } from "@/lib/access";
import { basePermissionAllows } from "@/lib/permissions";

const COMPANY_A = "org-a";
const COMPANY_B = "org-b";
const SITE_A1 = { id: "site-a1", organisationId: COMPANY_A };
const SITE_A2 = { id: "site-a2", organisationId: COMPANY_A };
const SITE_B1 = { id: "site-b1", organisationId: COMPANY_B };

const superAdmin = { id: "u-sa", role: "ADMIN" as const, organisationId: null, platformRole: "PLATFORM_SUPER_ADMIN" as const };
const companyAdmin = { id: "u-ca", role: "ADMIN" as const, organisationId: COMPANY_A, platformRole: null };
const siteAdmin = { id: "u-site", role: "ADMIN" as const, organisationId: COMPANY_A, platformRole: null };
const operator = { id: "u-op", role: "OPERATOR" as const, organisationId: COMPANY_A, platformRole: null };
const security = { id: "u-sec", role: "SECURITY" as const, organisationId: COMPANY_A, platformRole: null };
const transporter = { id: "u-tr", role: "TRANSPORTER" as const, organisationId: "haulier-x", platformRole: null };
const orphan = { id: "u-orphan", role: "ADMIN" as const, organisationId: null, platformRole: null };

beforeEach(() => {
  findMany.mockReset();
  findMany.mockImplementation(async ({ where }: { where: { userId: string } }) => {
    if (where.userId === siteAdmin.id) return [{ siteId: SITE_A1.id }];
    if (where.userId === operator.id) return [{ siteId: SITE_A2.id }];
    return [];
  });
});

describe("Persona site access", () => {
  it("Super Admin sees every site of every company", async () => {
    const ctx = await loadAccessContext(superAdmin);
    expect(ctx.kind).toBe("platform");
    expect(siteWhere(ctx)).toEqual({});
    for (const site of [SITE_A1, SITE_A2, SITE_B1]) expect(await canAccessSite(superAdmin, site)).toBe(true);
  });

  it("Company Admin sees all of their company's sites and none of another company's", async () => {
    const ctx = await loadAccessContext(companyAdmin);
    expect(ctx).toEqual({ kind: "company", organisationId: COMPANY_A });
    expect(siteWhere(ctx)).toEqual({ organisationId: COMPANY_A });
    expect(await canAccessSite(companyAdmin, SITE_A1)).toBe(true);
    expect(await canAccessSite(companyAdmin, SITE_A2)).toBe(true);
    expect(await canAccessSite(companyAdmin, SITE_B1)).toBe(false);
  });

  it("Site Admin sees only assigned sites", async () => {
    const ctx = await loadAccessContext(siteAdmin);
    expect(ctx).toEqual({ kind: "sites", organisationId: COMPANY_A, siteIds: [SITE_A1.id] });
    expect(viaSiteWhere(ctx)).toEqual({ site: { organisationId: COMPANY_A, id: { in: [SITE_A1.id] } } });
    expect(await canAccessSite(siteAdmin, SITE_A1)).toBe(true);
    expect(await canAccessSite(siteAdmin, SITE_A2)).toBe(false);
    expect(roleLabel("ADMIN", ctx)).toBe("Site Admin");
  });

  it("Operator restricted to a site cannot operate another site of the same company", async () => {
    expect(await canAccessSite(operator, SITE_A2)).toBe(true);
    expect(await canAccessSite(operator, SITE_A1)).toBe(false);
    expect(await canAccessSite(operator, SITE_B1)).toBe(false);
  });

  it("Security without site rows is company-wide but still tenant-bound", async () => {
    expect(await canAccessSite(security, SITE_A1)).toBe(true);
    expect(await canAccessSite(security, SITE_B1)).toBe(false);
  });

  it("the site-access lookup itself is tenant-bound (cross-company rows are ignored)", async () => {
    await loadAccessContext(companyAdmin);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: companyAdmin.id, site: { organisationId: COMPANY_A } } }));
  });

  it("fails closed for a non-super-admin without a company", async () => {
    await expect(loadAccessContext(orphan)).rejects.toBeInstanceOf(TenantScopeError);
    expect(await canAccessSite(orphan, SITE_A1)).toBe(false);
  });

  it("Transporter sees only its own loads, regardless of site", async () => {
    const own = { site: SITE_B1, booking: { transporterOrganisationId: "haulier-x" } };
    const other = { site: SITE_A1, booking: { transporterOrganisationId: "haulier-y" } };
    expect(await canViewTransaction(transporter, own)).toBe(true);
    expect(await canViewTransaction(transporter, other)).toBe(false);
  });

  it("Staff see transactions by site access, not by transporter", async () => {
    const atA1 = { site: SITE_A1, booking: { transporterOrganisationId: "haulier-y" } };
    const atB1 = { site: SITE_B1, booking: { transporterOrganisationId: "haulier-y" } };
    expect(await canViewTransaction(companyAdmin, atA1)).toBe(true);
    expect(await canViewTransaction(companyAdmin, atB1)).toBe(false);
    expect(await canViewTransaction(operator, atA1)).toBe(false);
  });

  it("contextAllowsSite rejects a site id that belongs to another company even if listed", () => {
    expect(contextAllowsSite({ kind: "sites", organisationId: COMPANY_A, siteIds: [SITE_B1.id] }, SITE_B1)).toBe(false);
  });
});

describe("Permission fallback for users without custom roles", () => {
  it("never grants everything by default", () => {
    expect(basePermissionAllows("OPERATOR", "transaction.process")).toBe(true);
    expect(basePermissionAllows("OPERATOR", "transaction.override")).toBe(false);
    expect(basePermissionAllows("OPERATOR", "role.assign")).toBe(false);
    expect(basePermissionAllows("SECURITY", "transaction.override")).toBe(false);
    expect(basePermissionAllows("TRANSPORTER", "configuration.update")).toBe(false);
  });
  it("company admins keep their full company permission set", () => {
    expect(basePermissionAllows("ADMIN", "transaction.override")).toBe(true);
    expect(basePermissionAllows("ADMIN", "configuration.update")).toBe(true);
  });
});
