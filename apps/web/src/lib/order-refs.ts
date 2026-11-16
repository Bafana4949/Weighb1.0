import { prisma } from "@/lib/prisma";

type OrderRefs = {
  siteId?: string | null;
  originSiteId?: string | null;
  destinationSiteId?: string | null;
  sourceId?: string | null;
  destinationId?: string | null;
  productId?: string | null;
};

/**
 * Every record an order points at must belong to the order's company. Returns an
 * error message, or null when all references are valid.
 */
export async function orderReferenceError(refs: OrderRefs, companyId: string): Promise<string | null> {
  const siteIds = [...new Set([refs.siteId, refs.originSiteId, refs.destinationSiteId].filter((v): v is string => Boolean(v)))];
  const [sites, source, destination, product] = await Promise.all([
    siteIds.length ? prisma.site.count({ where: { id: { in: siteIds }, organisationId: companyId } }) : 0,
    refs.sourceId ? prisma.source.count({ where: { id: refs.sourceId, organisationId: companyId } }) : 1,
    refs.destinationId ? prisma.destination.count({ where: { id: refs.destinationId, organisationId: companyId } }) : 1,
    refs.productId ? prisma.product.findFirst({ where: { id: refs.productId, organisationId: companyId }, select: { isActive: true } }) : null,
  ]);
  if (sites !== siteIds.length) return "Sites must belong to the order's company";
  if (!source) return "Source must belong to the order's company";
  if (!destination) return "Destination must belong to the order's company";
  if (refs.productId && (!product || !product.isActive)) return "Product must be an active product of the order's company";
  return null;
}

export async function productName(productId: string | null | undefined): Promise<string | null> {
  if (!productId) return null;
  return (await prisma.product.findUnique({ where: { id: productId }, select: { name: true } }))?.name ?? null;
}
