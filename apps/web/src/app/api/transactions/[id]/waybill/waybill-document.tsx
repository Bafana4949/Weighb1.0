import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatKg } from "@/lib/utils";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 8.5, fontFamily: "Helvetica", color: "#111", position: "relative" },
  watermarkContainer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: -1 },
  watermarkImage: { width: 340, opacity: 0.06 },
  copyLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, textAlign: "center", backgroundColor: "#1e293b", color: "#fff", paddingVertical: 3.5, marginBottom: 8, borderRadius: 2 },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1.5, borderBottomColor: "#111", paddingBottom: 8 },
  siteName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  orgLine: { fontSize: 8, color: "#333", marginTop: 1 },
  qr: { width: 68, height: 68 },
  
  ticketTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 4 },
  ticketTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  badgesRow: { flexDirection: "row", gap: 5 },
  typeBadge: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, borderWidth: 1, borderColor: "#111", paddingVertical: 2, paddingHorizontal: 5, borderRadius: 2 },
  statusBadgeComplete: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, backgroundColor: "#15803d", color: "#fff", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 2 },
  statusBadgeIncomplete: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, backgroundColor: "#ca8a04", color: "#fff", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 2 },
  ticketNumber: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  
  gridTwoCol: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  cardBox: { width: "48.5%", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 3, padding: 6, backgroundColor: "#f8fafc" },
  cardTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#475569", textTransform: "uppercase", marginBottom: 3, borderBottomWidth: 0.5, borderBottomColor: "#cbd5e1", paddingBottom: 2 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  cardLabel: { fontSize: 7.5, color: "#64748b" },
  cardValue: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#0f172a", textAlign: "right", maxWidth: "60%" },

  tableSection: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 3, marginTop: 4, overflow: "hidden" },
  tableHeader: { flexDirection: "row", backgroundColor: "#f1f5f9", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingVertical: 4, paddingHorizontal: 6 },
  tableHeaderCell: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#334155" },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 4, paddingHorizontal: 6, alignItems: "center" },
  tableCell: { fontSize: 8, color: "#0f172a" },

  weightsGrid: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: "#0f172a", paddingVertical: 8, backgroundColor: "#fafafa" },
  weightBox: { width: "32%", alignItems: "center" },
  weightTitle: { fontSize: 7.5, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },
  weightSub: { fontSize: 6.5, color: "#94a3b8", marginTop: 1 },
  weightVal: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 2, color: "#0f172a" },
  weightValStrong: { fontSize: 17, fontFamily: "Helvetica-Bold", marginTop: 2, color: "#047857" },

  signatures: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  signatureBlock: { width: "45%" },
  signatureLabel: { fontSize: 7.5, color: "#64748b", textTransform: "uppercase" },
  signatureName: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginTop: 2 },
  signatureLine: { borderTopWidth: 1, borderTopColor: "#0f172a", marginTop: 18, paddingTop: 2, fontSize: 7.5, color: "#64748b" },

  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  footerText: { fontSize: 6.5, color: "#64748b" },
  hash: { fontSize: 5.5, fontFamily: "Courier", color: "#94a3b8", marginTop: 1 },
});

export interface WaybillDocumentProps {
  waybillNumber: string;
  transactionType: "DISPATCH" | "RECEIPT";
  status: "COMPLETE" | "INCOMPLETE";
  copyLabel: string;
  
  // Site & Supplier Details
  siteName: string;
  siteAddress: string;
  supplierName: string;
  supplierPhone: string | null;
  supplierRegNo: string | null;
  
  // Locations
  dispatchLocation: string;
  receiptLocation: string;
  
  // Transport & Vehicle
  vehiclePlate: string;
  trailerReg: string | null;
  transportCompany: string;
  driverName: string;
  driverLicenceNumber: string;
  operatorName: string;
  
  // Product & Order
  product: string;
  orderNumber: string;
  externalRef: string;
  stockpileRef: string;
  comment: string;
  
  // Weighments & Times
  firstWeightLabel: string;
  firstWeightKg: number;
  firstTime: string | null;
  
  secondWeightLabel: string;
  secondWeightKg: number;
  secondTime: string | null;
  
  netWeightKg: number;
  grossWeightKg: number;
  tareWeightKg: number;
  
  overload: boolean;
  overloadVarianceKg: number;
  integrityHash: string;
  qrDataUrl: string;
  logoDataUrl?: string;
}

export function WaybillDocument(props: WaybillDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {props.logoDataUrl && (
          <View style={styles.watermarkContainer} fixed>
            <Image src={props.logoDataUrl} style={styles.watermarkImage} />
          </View>
        )}
        
        {/* Copy Banner */}
        <Text style={styles.copyLabel}>{props.copyLabel}</Text>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={{ maxWidth: "75%" }}>
            <Text style={styles.siteName}>{props.siteName}</Text>
            <Text style={styles.orgLine}>{props.siteAddress}</Text>
            <Text style={styles.orgLine}>Supplier: {props.supplierName}{props.supplierPhone ? ` · Tel: ${props.supplierPhone}` : ""}</Text>
            {props.supplierRegNo && <Text style={styles.orgLine}>Reg. No: {props.supplierRegNo}</Text>}
          </View>
          <Image src={props.qrDataUrl} style={styles.qr} />
        </View>

        {/* Title & Badges */}
        <View style={styles.ticketTitleRow}>
          <Text style={styles.ticketTitle}>OFFICIAL WEIGHBRIDGE WAYBILL</Text>
          <View style={styles.badgesRow}>
            <Text style={styles.typeBadge}>TYPE: {props.transactionType}</Text>
            <Text style={props.status === "COMPLETE" ? styles.statusBadgeComplete : styles.statusBadgeIncomplete}>
              STATUS: {props.status}
            </Text>
          </View>
        </View>
        <Text style={styles.ticketNumber}>{props.waybillNumber}</Text>

        {/* Consignment Locations & Supplier */}
        <View style={styles.gridTwoCol}>
          <View style={styles.cardBox}>
            <Text style={styles.cardTitle}>Origin & Dispatch Location</Text>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Supplier Name:</Text>
              <Text style={styles.cardValue}>{props.supplierName}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Dispatch Location:</Text>
              <Text style={styles.cardValue}>{props.dispatchLocation}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Stockpile / Pit:</Text>
              <Text style={styles.cardValue}>{props.stockpileRef}</Text>
            </View>
          </View>

          <View style={styles.cardBox}>
            <Text style={styles.cardTitle}>Destination & Receipt Location</Text>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Receipt Location:</Text>
              <Text style={styles.cardValue}>{props.receiptLocation}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Order Number:</Text>
              <Text style={styles.cardValue}>{props.orderNumber}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>External Reference:</Text>
              <Text style={styles.cardValue}>{props.externalRef}</Text>
            </View>
          </View>
        </View>

        {/* Vehicle, Product & Haulier Info */}
        <View style={styles.gridTwoCol}>
          <View style={styles.cardBox}>
            <Text style={styles.cardTitle}>Vehicle & Carrier Details</Text>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Truck Registration:</Text>
              <Text style={styles.cardValue}>{props.vehiclePlate}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Trailer(s):</Text>
              <Text style={styles.cardValue}>{props.trailerReg || "None"}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Transporter / Haulier:</Text>
              <Text style={styles.cardValue}>{props.transportCompany}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Driver Name:</Text>
              <Text style={styles.cardValue}>{props.driverName}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Driver Licence:</Text>
              <Text style={styles.cardValue}>{props.driverLicenceNumber}</Text>
            </View>
          </View>

          <View style={styles.cardBox}>
            <Text style={styles.cardTitle}>Product & Consignment Spec</Text>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Product Description:</Text>
              <Text style={[styles.cardValue, { color: "#0369a1" }]}>{props.product}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Weighbridge Operator:</Text>
              <Text style={styles.cardValue}>{props.operatorName}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Load Compliance:</Text>
              <Text style={[styles.cardValue, { color: props.overload ? "#b91c1c" : "#15803d" }]}>
                {props.overload ? `FAIL (+${formatKg(props.overloadVarianceKg)})` : "LEGAL COMPLIANT (PASS)"}
              </Text>
            </View>
            {props.comment !== "—" && (
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Special Notes:</Text>
                <Text style={styles.cardValue}>{props.comment}</Text>
              </View>
            )}
          </View>
        </View>

        {/* 1st & 2nd Weighment Summary Table */}
        <View style={styles.tableSection}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { width: "25%" }]}>Weighment Stage</Text>
            <Text style={[styles.tableHeaderCell, { width: "35%" }]}>Timestamp (Date & Time)</Text>
            <Text style={[styles.tableHeaderCell, { width: "20%" }]}>Scale Lane</Text>
            <Text style={[styles.tableHeaderCell, { width: "20%", textAlign: "right" }]}>Recorded Weight</Text>
          </View>

          {/* 1st Weighment Row */}
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: "25%", fontFamily: "Helvetica-Bold" }]}>
              1st Weighment ({props.firstWeightLabel})
            </Text>
            <Text style={[styles.tableCell, { width: "35%" }]}>{props.firstTime || "—"}</Text>
            <Text style={[styles.tableCell, { width: "20%", color: "#64748b" }]}>Lane 1 (Inbound Deck)</Text>
            <Text style={[styles.tableCell, { width: "20%", textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
              {formatKg(props.firstWeightKg)}
            </Text>
          </View>

          {/* 2nd Weighment Row */}
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: "25%", fontFamily: "Helvetica-Bold" }]}>
              2nd Weighment ({props.secondWeightLabel})
            </Text>
            <Text style={[styles.tableCell, { width: "35%" }]}>{props.secondTime || "—"}</Text>
            <Text style={[styles.tableCell, { width: "20%", color: "#64748b" }]}>Lane 2 (Outbound Deck)</Text>
            <Text style={[styles.tableCell, { width: "20%", textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
              {formatKg(props.secondWeightKg)}
            </Text>
          </View>
        </View>

        {/* Final Weight Totals Grid */}
        <View style={styles.weightsGrid}>
          <View style={styles.weightBox}>
            <Text style={styles.weightTitle}>Tare Weight (Empty)</Text>
            <Text style={styles.weightSub}>Truck & Trailer Chassis</Text>
            <Text style={styles.weightVal}>{formatKg(props.tareWeightKg)}</Text>
          </View>

          <View style={styles.weightBox}>
            <Text style={styles.weightTitle}>Gross Weight (Total)</Text>
            <Text style={styles.weightSub}>Truck + Net Cargo Payload</Text>
            <Text style={styles.weightVal}>{formatKg(props.grossWeightKg)}</Text>
          </View>

          <View style={[styles.weightBox, { borderLeftWidth: 1, borderLeftColor: "#cbd5e1" }]}>
            <Text style={[styles.weightTitle, { color: "#047857", fontFamily: "Helvetica-Bold" }]}>
              Net Weight (Payload)
            </Text>
            <Text style={styles.weightSub}>Product Delivered</Text>
            <Text style={styles.weightValStrong}>{formatKg(props.netWeightKg)}</Text>
          </View>
        </View>

        {/* Signatures */}
        <View style={styles.signatures}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>Driver Acknowledgement</Text>
            <Text style={styles.signatureName}>{props.driverName}</Text>
            <Text style={styles.orgLine}>Licence No: {props.driverLicenceNumber}</Text>
            <Text style={styles.signatureLine}>Driver Signature: _______________________</Text>
          </View>

          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>Weighbridge Official</Text>
            <Text style={styles.signatureName}>{props.operatorName}</Text>
            <Text style={styles.orgLine}>Certified Weighmaster</Text>
            <Text style={styles.signatureLine}>Operator Signature: _____________________</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={{ maxWidth: "70%" }}>
            <Text style={styles.footerText}>
              Legal metrology document verified by SHA-256 integrity hash chain. Scan QR code to verify authenticity.
            </Text>
            <Text style={styles.hash}>{props.integrityHash}</Text>
          </View>
          <Text style={[styles.footerText, { fontFamily: "Helvetica-Bold" }]}>SmartMine / WeighTruck Platform</Text>
        </View>
      </Page>
    </Document>
  );
}
