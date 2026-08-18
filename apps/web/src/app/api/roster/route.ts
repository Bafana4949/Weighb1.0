import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireRole } from "@/lib/api";

export async function GET(request: Request) {
  const auth = await requireRole([UserRole.ADMIN]);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  
  // Default to today
  const targetDate = dateParam ? new Date(dateParam) : new Date();
  targetDate.setHours(0, 0, 0, 0);

  const tomorrow = new Date(targetDate);
  tomorrow.setDate(tomorrow.getDate() + 1);

  try {
    const orgScope = auth.session!.user.organisationId ? {
      organisation: {
        clientMiningCompanies: {
          some: {
            miningCompanyId: auth.session!.user.organisationId
          }
        }
      }
    } : {};

    const rosters = await prisma.fleetRoster.findMany({
      where: {
        rosterDate: {
          gte: targetDate,
          lt: tomorrow
        },
        ...orgScope
      },
      include: {
        organisation: { select: { id: true, name: true } },
        vehicle: { select: { id: true, plate: true, tareWeightKg: true, legalMaxGvwKg: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
        trailer1: { select: { id: true, trailerId: true } },
        trailer2: { select: { id: true, trailerId: true } }
      }
    });

    return ok(rosters);
  } catch (error) {
    console.error("Failed to fetch roster", error);
    return fail("Failed to fetch roster");
  }
}
