import { describe, expect, it } from "vitest";
import { serviceOrderCommentSchema, serviceOrderSchema, serviceOrderUpdateSchema } from "@/lib/validation";

describe("service order validation", () => {
  it("accepts a minimal valid service order", () => {
    const result = serviceOrderSchema.safeParse({ title: "ANPR camera offline", description: "Camera at north gate stopped responding.", category: "ANPR" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid category", () => {
    const result = serviceOrderSchema.safeParse({ title: "ANPR camera offline", description: "Camera at north gate stopped responding.", category: "NOT_A_CATEGORY" });
    expect(result.success).toBe(false);
  });

  it("rejects a title that is too short", () => {
    const result = serviceOrderSchema.safeParse({ title: "AB", description: "Camera at north gate stopped responding.", category: "ANPR" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid status transition payload", () => {
    expect(serviceOrderUpdateSchema.safeParse({ status: "IN_PROGRESS" }).success).toBe(true);
    expect(serviceOrderUpdateSchema.safeParse({ status: "NOT_A_STATUS" }).success).toBe(false);
  });

  it("rejects an empty comment body", () => {
    expect(serviceOrderCommentSchema.safeParse({ body: "" }).success).toBe(false);
    expect(serviceOrderCommentSchema.safeParse({ body: "Technician dispatched." }).success).toBe(true);
  });
});
