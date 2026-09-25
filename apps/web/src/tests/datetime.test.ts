import { describe, expect, it } from "vitest";
import {
  formatSADate,
  formatSATime,
  formatSADateTime,
  parseSAStartOfDay,
  parseSAEndOfDay,
} from "@/lib/datetime";

describe("South African Timezone formatting & parsing (Africa/Johannesburg, UTC+2)", () => {
  it("formats UTC timestamp to South African Standard Time (SAST, UTC+2)", () => {
    // 18:51:52 UTC on 2026-09-25 is 20:51:52 SAST
    const d = new Date("2026-09-25T18:51:52.897Z");
    expect(formatSADate(d)).toBe("2026-09-25");
    expect(formatSATime(d)).toBe("20:51:52");
    expect(formatSADateTime(d)).toBe("2026-09-25 20:51:52");
  });

  it("handles day boundary conversion across UTC and SAST", () => {
    // 22:30 UTC on 2026-09-24 is 00:30 SAST on 2026-09-25
    const midnightAfter = new Date("2026-09-24T22:30:00.000Z");
    expect(formatSADate(midnightAfter)).toBe("2026-09-25");
    expect(formatSATime(midnightAfter)).toBe("00:30:00");
  });

  it("parses start and end of day in SAST", () => {
    const start = parseSAStartOfDay("2026-09-25");
    const end = parseSAEndOfDay("2026-09-25");

    // 00:00:00.000+02:00 is 22:00:00.000Z previous day
    expect(start.toISOString()).toBe("2026-09-24T22:00:00.000Z");
    // 23:59:59.999+02:00 is 21:59:59.999Z same day
    expect(end.toISOString()).toBe("2026-09-25T21:59:59.999Z");

    expect(formatSADate(start)).toBe("2026-09-25");
    expect(formatSATime(start)).toBe("00:00:00");
    expect(formatSADate(end)).toBe("2026-09-25");
    expect(formatSATime(end)).toBe("23:59:59");
  });
});
