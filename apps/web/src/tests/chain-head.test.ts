import { describe, expect, it, vi } from "vitest";
import { GENESIS_HASH, getChainHead } from "@/lib/chain";

describe("Chain Head Consistency & IN_PROGRESS Isolation", () => {
  it("ignores IN_PROGRESS transactions and returns the latest COMPLETED or HELD predecessor", async () => {
    const records = [
      {
        id: "tx-completed-1",
        siteId: "SITE-01",
        status: "COMPLETED",
        integrityHash: "hash-completed-0800",
        capturedAt: new Date("2026-09-18T08:00:00Z"),
        createdAt: new Date("2026-09-18T08:00:00Z"),
      },
      {
        id: "tx-held-2",
        siteId: "SITE-01",
        status: "HELD", // Overloaded truck still chains
        integrityHash: "hash-held-0830",
        capturedAt: new Date("2026-09-18T08:30:00Z"),
        createdAt: new Date("2026-09-18T08:15:00Z"),
      },
      {
        id: "tx-in-progress-3",
        siteId: "SITE-01",
        status: "IN_PROGRESS", // Active 1st weighment
        integrityHash: "temp-hash-in-progress-0900",
        capturedAt: new Date("2026-09-18T09:00:00Z"),
        createdAt: new Date("2026-09-18T09:00:00Z"),
      },
    ];

    const fakeClient = {
      weighbridgeTransaction: {
        findFirst: vi.fn(async ({ where, orderBy }) => {
          // Filter matching Prisma's getChainHead query
          const filtered = records.filter((r) => {
            if (r.siteId !== where.siteId) return false;
            if (!where.status?.in?.includes(r.status)) return false;
            if (where.integrityHash?.not === "" && !r.integrityHash) return false;
            return true;
          });

          filtered.sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());
          return filtered[0] ?? null;
        }),
      },
    };

    const head = await getChainHead(fakeClient, "SITE-01");

    // Must return the HELD record at 08:30, NOT the IN_PROGRESS record at 09:00
    expect(head.integrityHash).toBe("hash-held-0830");
    expect(head.capturedAt).toEqual(new Date("2026-09-18T08:30:00Z"));
  });

  it("returns GENESIS_HASH when site has no completed or held transactions (only IN_PROGRESS)", async () => {
    const records = [
      {
        id: "tx-only-in-progress",
        siteId: "SITE-02",
        status: "IN_PROGRESS",
        integrityHash: "temp-hash-0700",
        capturedAt: new Date("2026-09-18T07:00:00Z"),
        createdAt: new Date("2026-09-18T07:00:00Z"),
      },
    ];

    const fakeClient = {
      weighbridgeTransaction: {
        findFirst: vi.fn(async ({ where }) => {
          const filtered = records.filter((r) => {
            if (r.siteId !== where.siteId) return false;
            if (!where.status?.in?.includes(r.status)) return false;
            return true;
          });
          return filtered[0] ?? null;
        }),
      },
    };

    const head = await getChainHead(fakeClient, "SITE-02");
    expect(head.integrityHash).toBe(GENESIS_HASH);
    expect(head.capturedAt).toBeNull();
  });
});
