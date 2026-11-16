import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail,ok,requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";
import { safeUserSelect } from "@/lib/utils";
import { saveFile } from "@/lib/storage";

const MAX_BYTES = 10 * 1024 * 1024;
// Evidence files only: documents and images. Anything else (HTML, SVG, scripts) is refused.
const ALLOWED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"], "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"],
  "text/plain": [".txt", ".log"], "text/csv": [".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};
// base64 inflates by 4/3; reject oversized payloads before decoding them.
const uploadSchema = z.object({ fileName: z.string().min(1).max(200), contentType: z.string().min(1).max(120), dataBase64: z.string().min(1).max(Math.ceil((MAX_BYTES * 4) / 3) + 8) });

function inScope(row: { organisationId: string }, callerOrg: string | null) { return !callerOrg || row.organisationId === callerOrg; }

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN, UserRole.OPERATOR, UserRole.SECURITY, UserRole.TRANSPORTER]);
  if (a.error) return a.error;
  const { id } = await params;
  const order = await prisma.serviceOrder.findUnique({ where: { id } });
  if (!order || !inScope(order, a.session!.user.organisationId)) return fail("Service order not found", 404);
  const attachments = await prisma.serviceOrderAttachment.findMany({ where: { serviceOrderId: id }, include: { uploadedBy: { select: safeUserSelect } }, orderBy: { createdAt: "desc" } });
  return ok(attachments);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole([UserRole.ADMIN, UserRole.OPERATOR, UserRole.SECURITY, UserRole.TRANSPORTER]);
  if (a.error) return a.error;
  const { id } = await params;
  const order = await prisma.serviceOrder.findUnique({ where: { id } });
  if (!order || !inScope(order, a.session!.user.organisationId)) return fail("Service order not found", 404);
  const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid attachment", 422);
  const buffer = Buffer.from(parsed.data.dataBase64, "base64");
  if (buffer.byteLength === 0) return fail("File is empty", 422);
  if (buffer.byteLength > MAX_BYTES) return fail("File exceeds the 10 MB limit", 413);
  const extension = parsed.data.fileName.includes(".") ? `.${parsed.data.fileName.split(".").pop()!.toLowerCase()}` : "";
  const allowedExtensions = ALLOWED_TYPES[parsed.data.contentType];
  if (!allowedExtensions || !allowedExtensions.includes(extension)) return fail("Only PDF, image, text, CSV, XLSX or DOCX files can be attached", 415);
  const storageKey = await saveFile(buffer, extension);
  const attachment = await prisma.serviceOrderAttachment.create({
    data: { serviceOrderId: id, uploadedById: a.session!.user.id, fileName: parsed.data.fileName, contentType: parsed.data.contentType, sizeBytes: buffer.byteLength, storageKey },
    include: { uploadedBy: { select: safeUserSelect } },
  });
  await audit({ userId: a.session!.user.id, siteId: order.siteId, action: "SERVICE_ORDER_ATTACHMENT_UPLOADED", entityType: "service_order", entityId: id, afterData: { attachmentId: attachment.id, fileName: attachment.fileName, sizeBytes: attachment.sizeBytes } });
  return ok(attachment, 201);
}
