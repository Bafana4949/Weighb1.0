import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,requireRole } from "@/lib/api";
import { getFile } from "@/lib/storage";

function inScope(row: { organisationId: string }, callerOrg: string | null) { return !callerOrg || row.organisationId === callerOrg; }

export async function GET(_: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const a = await requireRole([UserRole.ADMIN, UserRole.OPERATOR, UserRole.SECURITY, UserRole.TRANSPORTER]);
  if (a.error) return a.error;
  const { id, attachmentId } = await params;
  const order = await prisma.serviceOrder.findUnique({ where: { id } });
  if (!order || !inScope(order, a.session!.user.organisationId)) return fail("Service order not found", 404);
  const attachment = await prisma.serviceOrderAttachment.findFirst({ where: { id: attachmentId, serviceOrderId: id } });
  if (!attachment) return fail("Attachment not found", 404);
  try {
    const buffer = await getFile(attachment.storageKey);
    return new Response(new Uint8Array(buffer), {
      headers: { "content-type": attachment.contentType, "content-disposition": `attachment; filename="${attachment.fileName}"` },
    });
  } catch {
    return fail("File is unavailable", 404);
  }
}
