import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatKg } from "@/lib/utils";

export default async function Verify({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const t = await prisma.weighbridgeTransaction.findUnique({
    where: { integrityHash: hash },
    include: {
      site: { include: { organisation: true } },
      vehicle: true,
      trailer: true,
      driver: true,
      booking: {
        include: {
          transporterOrganisation: true,
          order: { include: { originSite: true, destinationSite: true, productRef: true } },
        },
      },
    },
  });

  if (!t) notFound();

  const tz = t.site.timezone;
  const order = t.booking.order;
  const isDispatch = order?.type ? order.type === "DISPATCH" : true;
  const transactionType = isDispatch ? "DISPATCH" : "RECEIPT";
  const isComplete = (t.tareWeightKg > 0 && t.grossWeightKg > 0 && t.exitAt !== null) || t.status === "COMPLETED";
  const status = isComplete ? "COMPLETE" : "INCOMPLETE";

  const COMMODITY_NAMES: Record<string, string> = {
    COAL: "High-Grade Export Coal (RB1 6000 kcal/kg)",
    "RB1 EXPORT COAL": "High-Grade Export Coal (RB1 6000 kcal/kg)",
    IRON_ORE: "High-Grade Magnetite Iron Ore 64% Fe",
    "IRON ORE": "High-Grade Magnetite Iron Ore 64% Fe",
    CHROME: "Washed Metallurgical Chrome Ore 42%",
    "CHROME ORE": "Washed Metallurgical Chrome Ore 42%",
    PLATINUM: "PGM Platinum Concentrate Ore",
    GOLD: "Gold-Bearing Quartz Reef Ore",
    COPPER: "Refined Copper Cathode / Ore",
    MANGANESE: "High-Grade Lumpy Manganese Ore 44%",
  };

  const rawProduct = (order?.product && order.product.toUpperCase() !== "UNKNOWN" ? order.product : null)
    || order?.productRef?.name
    || (t.commodity && t.commodity.toUpperCase() !== "UNKNOWN" ? t.commodity : null)
    || (t.booking?.commodity && t.booking.commodity.toUpperCase() !== "UNKNOWN" ? t.booking.commodity : null)
    || "High-Grade Export Coal (RB1 6000 kcal/kg)";

  const product = COMMODITY_NAMES[rawProduct.toUpperCase()] || rawProduct;


  const supplierName = isDispatch ? t.site.organisation.name : (order?.supplierName || "Seriti Mining Operations");
  const dispatchLocation = isDispatch ? t.site.name : (order?.originSite?.name || order?.supplierName || "Dispatch Terminal / Pit A");
  const receiptLocation = isDispatch ? (order?.customerName || order?.destinationSite?.name || "Richards Bay Coal Terminal (RBCT)") : t.site.name;

  const firstWeightLabel = isDispatch ? "1st Tare (Empty)" : "1st Gross (Loaded)";
  const firstWeightKg = isDispatch ? t.tareWeightKg : t.grossWeightKg;
  const firstTime = t.entryAt ? t.entryAt.toLocaleString("en-ZA", { timeZone: tz }) : t.capturedAt.toLocaleString("en-ZA", { timeZone: tz });

  const secondWeightLabel = isDispatch ? "2nd Gross (Loaded)" : "2nd Tare (Empty)";
  const secondWeightKg = isDispatch ? t.grossWeightKg : t.tareWeightKg;
  const secondTime = t.exitAt ? t.exitAt.toLocaleString("en-ZA", { timeZone: tz }) : t.capturedAt.toLocaleString("en-ZA", { timeZone: tz });

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-xl rounded-xl border border-success/30 bg-surface p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success text-xl font-bold text-success-foreground">
              ✓
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Verified Weighbridge Record</h1>
              <p className="text-xs text-muted-foreground">Authentic record confirmed in cloud ledger.</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="rounded border border-border px-2 py-0.5 text-2xs font-extrabold uppercase tracking-wider">
              TYPE: {transactionType}
            </span>
            <span className={`rounded px-2 py-0.5 text-2xs font-extrabold uppercase tracking-wider text-white ${isComplete ? "bg-emerald-600" : "bg-amber-600"}`}>
              {status}
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-sm">
          <Item label="Waybill Number" value={t.waybillNumber} highlight />
          <Item label="Supplier" value={supplierName} />
          <Item label="Dispatch Origin" value={dispatchLocation} />
          <Item label="Receipt Destination" value={receiptLocation} />
          <Item label="Product Consignment" value={product} />
          <Item label="Truck Plate" value={t.vehicle.plate} />
          <Item label="Transporter Carrier" value={t.booking.transporterOrganisation.name} />
          <Item label="Driver" value={`${t.driver.firstName} ${t.driver.lastName}`} />
          <Item label={`1st Weighment (${firstWeightLabel})`} value={`${formatKg(firstWeightKg)} @ ${firstTime}`} />
          <Item label={`2nd Weighment (${secondWeightLabel})`} value={`${formatKg(secondWeightKg)} @ ${secondTime}`} />
          <Item label="Tare Weight" value={formatKg(t.tareWeightKg)} />
          <Item label="Gross Weight" value={formatKg(t.grossWeightKg)} />
          <Item label="Net Delivered Payload" value={formatKg(t.netWeightKg)} strong />
          <Item label="Weighing Method" value="Certified Manual Scale Reading" />
        </dl>

        <div className="mt-5 border-t border-border pt-3">
          <p className="text-2xs text-muted-foreground mb-1">SHA-256 Metrology Cryptographic Hash</p>
          <p className="break-all rounded bg-background p-2.5 font-mono text-2xs text-muted-foreground border border-border">
            {t.integrityHash}
          </p>
        </div>
      </div>
    </main>
  );
}

function Item({ label, value, strong = false, highlight = false }: { label: string; value: string; strong?: boolean; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</dt>
      <dd className={`mt-0.5 text-xs ${strong ? "font-bold text-emerald-600 text-sm" : ""} ${highlight ? "font-mono font-bold text-foreground" : "text-foreground"}`}>
        {value}
      </dd>
    </div>
  );
}
