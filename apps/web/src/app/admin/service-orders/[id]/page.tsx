import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { safeUserSelect } from "@/lib/utils";
import { ServiceOrderDetail } from "@/components/service-order-detail";

export default async function ServiceOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await auth();
  if (!s?.user) redirect("/login");
  const { id } = await params;
  const isSuperAdmin = isPlatformSuperAdmin(s.user);
  const order = await prisma.serviceOrder.findUnique({ where: { id }, include: { organisation: true, site: true, createdBy: { select: safeUserSelect }, assignedTo: { select: safeUserSelect } } });
  if (!order || (!isSuperAdmin && order.organisationId !== s.user.organisationId)) notFound();

  const [comments, attachments, assignableUsers] = await Promise.all([
    prisma.serviceOrderComment.findMany({ where: { serviceOrderId: id, ...(isSuperAdmin ? {} : { isInternal: false }) }, include: { author: { select: safeUserSelect } }, orderBy: { createdAt: "asc" } }),
    prisma.serviceOrderAttachment.findMany({ where: { serviceOrderId: id }, include: { uploadedBy: { select: safeUserSelect } }, orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({ where: { OR: [{ organisationId: order.organisationId, role: "ADMIN" }, { platformRole: { not: null } }], status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true } }),
  ]);

  return <AppShell role={s.user.role} userName={s.user.name ?? "Admin"} orgName={s.user.organisationName} isSuperAdmin={isSuperAdmin}>
    <ServiceOrderDetail
      order={JSON.parse(JSON.stringify(order))}
      comments={JSON.parse(JSON.stringify(comments))}
      attachments={JSON.parse(JSON.stringify(attachments))}
      assignableUsers={assignableUsers}
      isSuperAdmin={isSuperAdmin}
      canManage={isSuperAdmin || s.user.role === "ADMIN"}
    />
  </AppShell>;
}
