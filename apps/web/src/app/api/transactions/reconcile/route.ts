import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { fail, ok, requireSiteOrRole } from "@/lib/api";
import { reconcileSchema } from "@/lib/validation";
import { reconcileTransaction } from "@/lib/reconciliation";
import { routeNotification } from "@/lib/notifications";
import { rateLimitOrFail } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Generous relative to the other creation routes: a legitimate site daemon
  // catching up on a connectivity outage retries its whole backlog quickly,
  // and a DUAL_ENTRY_EXIT site's two lanes reconcile concurrently from the
  // same IP. This exists to blunt a leaked/guessed site-api-key, not to
  // throttle normal edge sync.
  const limited = rateLimitOrFail(request, "transactions-reconcile", 240, 60 * 1000);
  if (limited) return limited;
  const access = await requireSiteOrRole(request, [UserRole.ADMIN]);
  if (access.error) return access.error;
  const parsed = reconcileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues.map((issue) => issue.message).join("; "), 422);

  try {
    const result = await reconcileTransaction(parsed.data);
    if (result.duplicate) {
      return NextResponse.json({
        success: false,
        data: {
          id: result.transaction.id,
          confirmation_hash: result.transaction.confirmationHash,
          waybill_number: result.transaction.waybillNumber,
        },
        error: "Duplicate transaction",
      }, { status: 409 });
    }
    try {
      await routeNotification({
        event: result.transaction.overload ? "OVERLOAD" : "TRANSACTION_COMPLETE",
        severity: result.transaction.overload ? "HIGH" : "LOW",
        subject: result.transaction.overload ? "Overload transaction held" : "Weighbridge transaction complete",
        body: `Waybill ${result.transaction.waybillNumber} recorded with net weight ${result.transaction.netWeightKg} kg.`,
        metadata: { transaction_id: result.transaction.id, site_id: result.transaction.siteId },
      });
    } catch (notificationError) {
      console.error("Transaction persisted but notification routing failed", notificationError);
    }
    return ok({
      id: result.transaction.id,
      confirmation_hash: result.transaction.confirmationHash,
      waybill_number: result.transaction.waybillNumber,
    }, 201);
  } catch (error) {
    const code = String(error instanceof Error ? error.message : error);
    const map: Record<string, [string, number]> = {
      BOOKING_NOT_FOUND: ["Booking not found", 404],
      BOOKING_IDENTITY_MISMATCH: ["Booking identity does not match transaction", 409],
      SITE_MISMATCH: ["Site does not match booking", 409],
      NET_WEIGHT_MISMATCH: ["Net weight calculation is invalid", 422],
      TARE_WEIGHT_MISMATCH: ["Tare weight differs from registered vehicle", 409],
      INTEGRITY_HASH_MISMATCH: ["Integrity hash validation failed", 422],
      HASH_CHAIN_MISMATCH: ["Transaction hash chain is out of sequence", 409],
    };
    const mapped = map[code];
    return mapped ? fail(mapped[0], mapped[1]) : fail("Unable to reconcile transaction", 500);
  }
}
