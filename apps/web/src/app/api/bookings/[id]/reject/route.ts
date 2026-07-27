import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { routeNotification } from "@/lib/notifications";
const schema=z.object({reason:z.string().min(10).max(500)});
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){const a=await requireRole([UserRole.ADMIN,UserRole.OPERATOR]);if(a.error)return a.error;const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return fail("A rejection reason of at least 10 characters is required",422);const {id}=await params;const row=await prisma.booking.findUnique({where:{id},include:{site:true}});if(!row)return fail("Booking not found",404);if(row.status==="COMPLETED")return fail("Completed bookings cannot be rejected",409);const booking=await prisma.booking.update({where:{id},data:{status:"REJECTED",rejectionReason:parsed.data.reason,approvedById:a.session!.user.id,approvedAt:new Date()}});await routeNotification({event:"BOOKING_REJECTED",severity:"MEDIUM",subject:`Booking ${booking.reference} rejected`,body:parsed.data.reason,organisationId:booking.transporterOrganisationId,metadata:{booking_id:id,site_id:row.site.code}});return ok(booking)}
