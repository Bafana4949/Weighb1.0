import { UserRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";
import { safeUserSelect } from "@/lib/utils";
import { orderBaseSchema } from "@/lib/validation";
const includeAll={site:true,originSite:true,destinationSite:true,source:true,destination:true,productRef:true,createdBy:{select:safeUserSelect},bookings:{include:{transactions:true}}} as const;
async function scoped(id:string,callerOrg:string|null){const row=await prisma.weighbridgeOrder.findUnique({where:{id},include:{site:true}});if(!row)return null;if(callerOrg&&row.site.organisationId!==callerOrg)return null;return row}
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const a=await requireRole([UserRole.TRANSPORTER,UserRole.OPERATOR,UserRole.ADMIN,UserRole.SECURITY]);if(a.error)return a.error;const {id}=await params;const order=await prisma.weighbridgeOrder.findUnique({where:{id},include:includeAll});return order?ok(order):fail("Order not found",404)}
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  const a=await requireRole([UserRole.ADMIN]);
  if(a.error)return a.error;
  const {id}=await params;
  const before=await scoped(id,a.session!.user.organisationId);
  if(!before)return fail("Order not found",404);
  const parsed = orderBaseSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid order update", 422);

  if (parsed.data.orderNumber) {
    const cleanNo = parsed.data.orderNumber.trim();
    const existing = await prisma.weighbridgeOrder.findFirst({
      where: { orderNumber: cleanNo, id: { not: id } },
    });
    if (existing) return fail(`Order number '${cleanNo}' is already taken by another order`, 409);
    parsed.data.orderNumber = cleanNo;
  }

  if (a.session!.user.platformRole !== "PLATFORM_SUPER_ADMIN") {
    delete parsed.data.ratePerTonZar;
  }
  if (parsed.data.productId) {
    const prod = await prisma.product.findUnique({ where: { id: parsed.data.productId } });
    if (prod) {
      (parsed.data as any).product = prod.name;
    }
  }
  const updated = await prisma.weighbridgeOrder.update({
    where: { id },
    data: parsed.data as Prisma.WeighbridgeOrderUncheckedUpdateInput,
    include: includeAll,
  });
  await audit({
    userId: a.session!.user.id,
    siteId: before.siteId,
    action: "ORDER_UPDATED",
    entityType: "weighbridge_order",
    entityId: id,
    beforeData: before,
    afterData: updated,
  });
  return ok(updated);
}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){const a=await requireRole([UserRole.ADMIN]);if(a.error)return a.error;const {id}=await params;const before=await scoped(id,a.session!.user.organisationId);if(!before)return fail("Order not found",404);const updated=await prisma.weighbridgeOrder.update({where:{id},data:{status:"CANCELLED"}});await audit({userId:a.session!.user.id,siteId:before.siteId,action:"ORDER_CANCELLED",entityType:"weighbridge_order",entityId:id,beforeData:{status:before.status},afterData:{status:updated.status}});return ok(updated)}
