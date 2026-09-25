import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { formatKg } from "@/lib/weights";
import { isPlatformSuperAdmin } from "@/lib/permissions";

export default async function Waybill({ params }: { params: Promise<{ id: string }> }) {
  const s = await auth();
  if (!s?.user) redirect("/login");

  const { id } = await params;
  const t = await prisma.weighbridgeTransaction.findUnique({
    where: { id },
    include: {
      site: { include: { organisation: true } },
      vehicle: true,
      trailer: true,
      driver: true,
      operator: true,
      booking: {
        include: {
          transporterOrganisation: true,
          order: { include: { originSite: true, destinationSite: true, productRef: true } },
          additionalTrailers: { include: { trailer: true }, orderBy: { position: "asc" } },
        },
      },
    },
  });

  if (!t) notFound();

  // Multi-tenant isolation check
  const isSuper = isPlatformSuperAdmin(s.user);
  if (!isSuper) {
    const userOrgId = s.user.organisationId;
    if (!userOrgId) notFound();
    const isSiteOrg = t.site.organisationId === userOrgId;
    const isTransporterOrg = t.booking.transporterOrganisationId === userOrgId;
    if (!isSiteOrg && !isTransporterOrg) {
      notFound();
    }
  }

  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/verify/${t.integrityHash}`;
  const qr = await QRCode.toDataURL(url, { width: 220, margin: 1 });
  const tz = t.site.timezone || "Africa/Johannesburg";
  const order = t.booking.order;
  const isDispatch = order?.type ? order.type === "DISPATCH" : true;
  const transactionType: "DISPATCH" | "RECEIPT" = isDispatch ? "DISPATCH" : "RECEIPT";

  // Status: Complete or Incomplete
  const isComplete = (t.tareWeightKg > 0 && t.grossWeightKg > 0 && t.exitAt !== null) || t.status === "COMPLETED";
  const status: "COMPLETE" | "INCOMPLETE" = isComplete ? "COMPLETE" : "INCOMPLETE";

  // Product name resolution
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
    || "General Cargo";

  const product = COMMODITY_NAMES[rawProduct.toUpperCase()] || rawProduct;

  // Supplier Details
  const supplierName = order?.supplierName || t.site.organisation.name || "—";
  const supplierPhone = t.site.organisation.contactPhone;
  const supplierRegNo = t.site.organisation.registrationNo;

  // Order & Stockpile References
  const orderNumber = order?.orderNumber || (t.booking.reference ? t.booking.reference.replace("BK-", "ORD-") : "—");
  const stockpileRef = order?.stockpile || "—";

  // Locations
  const dispatchLocation = isDispatch 
    ? (stockpileRef !== "—" ? `${t.site.name} (${stockpileRef})` : t.site.name)
    : (order?.originSite?.name || order?.supplierName || t.site.name);

  const receiptLocation = isDispatch 
    ? (order?.customerName || order?.destinationSite?.name || "—") 
    : t.site.name;

  const trailerRegs = [
    t.trailer ? (t.trailer.registrationNo ?? t.trailer.trailerId) : null,
    ...t.booking.additionalTrailers.map((bt) => bt.trailer.registrationNo ?? bt.trailer.trailerId),
  ].filter((v): v is string => Boolean(v));
  const trailerReg = trailerRegs.length ? trailerRegs.join(" ") : null;

  // 1st & 2nd Weighments and Times
  const firstWeightLabel = isDispatch ? "1st Tare (Empty)" : "1st Gross (Loaded)";
  const firstWeightKg = isDispatch ? t.tareWeightKg : t.grossWeightKg;
  const firstTime = t.entryAt ? t.entryAt.toLocaleString("en-ZA", { timeZone: tz }) : t.capturedAt.toLocaleString("en-ZA", { timeZone: tz });

  const secondWeightLabel = isDispatch ? "2nd Gross (Loaded)" : "2nd Tare (Empty)";
  const secondWeightKg = isDispatch ? t.grossWeightKg : t.tareWeightKg;
  const secondTime = t.exitAt ? t.exitAt.toLocaleString("en-ZA", { timeZone: tz }) : t.capturedAt.toLocaleString("en-ZA", { timeZone: tz });

  const reprintFlag = t.printCount > 0 ? "&reprint=true" : "";

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8 print:bg-white print:p-0 print:text-black">
      <div className="mx-auto max-w-3xl rounded-xl bg-white p-8 text-zinc-950 shadow-2xl border border-zinc-200 print:border-none print:shadow-none">
        
        {/* Top Header */}
        <div className="flex items-start justify-between border-b-2 border-zinc-900 pb-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{t.site.name}</h1>
            <p className="text-xs text-zinc-600">{t.site.address}</p>
            <p className="text-xs text-zinc-700 font-medium">
              Supplier: <span className="font-semibold">{supplierName}</span>
              {supplierPhone ? ` · Tel: ${supplierPhone}` : ""}
            </p>
            {supplierRegNo && <p className="text-xs text-zinc-500">Reg. No: {supplierRegNo}</p>}
          </div>
          <div className="flex flex-col items-end">
            <img src={qr} alt="Verification QR code" className="h-24 w-24 rounded border border-zinc-200 p-1" />
            <span className="mt-1 text-[10px] text-zinc-500 font-mono">Scan to Verify</span>
          </div>
        </div>

        {/* Title, Waybill Number & Badges */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Official Waybill Ticket</span>
            <p className="font-mono text-3xl font-extrabold tracking-tight text-zinc-900">{t.waybillNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border-2 border-zinc-900 px-3 py-1 text-xs font-extrabold uppercase tracking-wider bg-zinc-50">
              TYPE: {transactionType}
            </span>
            <span className={`rounded-md px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white ${isComplete ? "bg-emerald-600" : "bg-amber-600"}`}>
              STATUS: {status}
            </span>
          </div>
        </div>

        {/* Origin & Destination Locations */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Dispatch Location (Origin)</p>
            <p className="mt-1 text-sm font-bold text-zinc-900">{dispatchLocation}</p>
            <p className="mt-2 text-xs text-zinc-600">Supplier: <span className="font-semibold">{supplierName}</span></p>
            <p className="text-xs text-zinc-600">Stockpile / Pit: <span className="font-mono font-semibold">{stockpileRef}</span></p>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Receipt Location (Destination)</p>
            <p className="mt-1 text-sm font-bold text-zinc-900">{receiptLocation}</p>
            <p className="mt-2 text-xs text-zinc-600">Contract Order: <span className="font-mono font-semibold">{orderNumber}</span></p>
            <p className="text-xs text-zinc-600">External Ref: <span className="font-mono font-semibold">{t.booking.reference}</span></p>
          </div>
        </div>

        {/* Consignment & Transport Metadata */}
        <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 border-t border-b border-zinc-200 py-4 text-sm">
          <Field label="Truck Registration" value={t.vehicle.plate} strong />
          <Field label="Trailer(s)" value={trailerReg ?? "None (Rigid)"} />
          <Field label="Transporter / Carrier" value={t.booking.transporterOrganisation.name} strong />
          <Field label="Driver Name" value={`${t.driver.firstName} ${t.driver.lastName}`} />
          <Field label="Weighbridge Operator" value={t.operator ? `${t.operator.firstName} ${t.operator.lastName}` : "MANUAL WEIGHBRIDGE"} />
          <Field label="Product Consignment" value={product} highlight />
          <Field label="Scale Reading Mode" value="CERTIFIED MANUAL SCALE" />
        </dl>

        {/* 1st & 2nd Weighment Stages Table */}
        <div className="mt-5 overflow-hidden rounded-lg border border-zinc-300">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-100 text-zinc-700 uppercase font-bold border-b border-zinc-300">
              <tr>
                <th className="px-4 py-2.5">Weighment Stage</th>
                <th className="px-4 py-2.5">Recorded Time</th>
                <th className="px-4 py-2.5">Scale Lane</th>
                <th className="px-4 py-2.5 text-right">Weight (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              <tr>
                <td className="px-4 py-2.5 font-bold text-zinc-900">1st Weighment ({firstWeightLabel})</td>
                <td className="px-4 py-2.5 text-zinc-700 font-mono">{firstTime}</td>
                <td className="px-4 py-2.5 text-zinc-500">Lane 1 (Inbound Deck)</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-zinc-900">{formatKg(firstWeightKg)}</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-bold text-zinc-900">2nd Weighment ({secondWeightLabel})</td>
                <td className="px-4 py-2.5 text-zinc-700 font-mono">{secondTime}</td>
                <td className="px-4 py-2.5 text-zinc-500">Lane 2 (Outbound Deck)</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-zinc-900">{formatKg(secondWeightKg)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Final Weights Summary */}
        <div className="grid grid-cols-3 gap-4 border-y-2 border-zinc-900 py-5 text-center my-5 bg-zinc-50/50 rounded-lg">
          <Weight label="Tare (Empty)" value={formatKg(t.tareWeightKg)} sub="Truck & Chassis" />
          <Weight label="Gross (Total)" value={formatKg(t.grossWeightKg)} sub="Vehicle + Cargo" />
          <Weight label="Nett (Payload)" value={formatKg(t.netWeightKg)} sub="Delivered Product" strong />
        </div>

        {/* Signatures */}
        <div className="mt-8 flex justify-between gap-8 pt-4">
          <div className="w-1/2">
            <p className="text-xs uppercase font-bold text-zinc-500">Driver Acknowledgement</p>
            <p className="mt-1 font-bold text-zinc-900">{t.driver.firstName} {t.driver.lastName}</p>
            <p className="text-xs text-zinc-600">Licence {t.driver.licenceNumber}</p>
            <div className="mt-8 border-t border-zinc-900 pt-1 text-xs text-zinc-500">Driver Signature</div>
          </div>
          <div className="w-1/2">
            <p className="text-xs uppercase font-bold text-zinc-500">Weighbridge Official</p>
            <p className="mt-1 font-bold text-zinc-900">{t.operator ? `${t.operator.firstName} ${t.operator.lastName}` : "MANUAL WEIGHBRIDGE"}</p>
            <p className="text-xs text-zinc-600">Certified Metrology Scale</p>
            <div className="mt-8 border-t border-zinc-900 pt-1 text-xs text-zinc-500">Operator Signature</div>
          </div>
        </div>

        {/* Cryptographic Footprint */}
        <div className="mt-8 border-t border-zinc-200 pt-4">
          <p className="text-[10px] text-zinc-500">
            This weighbridge document is cryptographically anchored by a SHA-256 integrity hash chain. Verify authenticity via the QR code or cloud verification service.
          </p>
          <p className="break-all font-mono text-[9px] text-zinc-400 mt-1">{t.integrityHash}</p>
        </div>
      </div>

      {/* Print Controls (Hidden when printing) */}
      <div className="mx-auto mt-6 max-w-3xl print:hidden">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-zinc-900">Download & Print Waybill Slips</p>
            <span className="text-xs text-zinc-500">
              {t.printCount > 0 ? `Printed ${t.printCount} time${t.printCount === 1 ? "" : "s"} (reprints audited)` : "Initial print"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button asChild className="bg-emerald-700 hover:bg-emerald-800 text-white">
              <Link href={`/api/transactions/${t.id}/waybill?copy=CLIENT${reprintFlag}`} target="_blank" rel="noopener noreferrer">Client / Office Copy (PDF)</Link>
            </Button>
            <Button asChild className="bg-blue-700 hover:bg-blue-800 text-white">
              <Link href={`/api/transactions/${t.id}/waybill?copy=DRIVER${reprintFlag}`} target="_blank" rel="noopener noreferrer">Driver / Transporter Copy (PDF)</Link>
            </Button>
            <Button asChild variant="outline" className="border-zinc-300">
              <Link href={`/api/transactions/${t.id}/waybill?copy=SECURITY${reprintFlag}`} target="_blank" rel="noopener noreferrer">Security / Gate Copy (PDF)</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href={`/api/transactions/${t.id}/waybill?format=thermal${reprintFlag}`} target="_blank" rel="noopener noreferrer">Thermal Receipt Slip (80mm)</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({ label, value, strong = false, highlight = false, status }: { label: string; value: string; strong?: boolean; highlight?: boolean; status?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-xs text-zinc-500 uppercase tracking-wide">{label}</dt>
      <dd className={`text-right ${strong ? "font-bold text-zinc-900" : ""} ${highlight ? "font-bold text-blue-700" : ""} ${status !== undefined ? (status ? "text-emerald-700 font-bold" : "text-red-700 font-bold") : "text-zinc-800"}`}>
        {value}
      </dd>
    </div>
  );
}

function Weight({ label, value, sub, strong = false }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase font-bold text-zinc-500 tracking-wider">{label}</p>
      <p className={`${strong ? "text-3xl text-emerald-700" : "text-2xl text-zinc-900"} mt-1 font-mono font-bold`}>{value}</p>
      {sub && <p className="text-[10px] text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}
