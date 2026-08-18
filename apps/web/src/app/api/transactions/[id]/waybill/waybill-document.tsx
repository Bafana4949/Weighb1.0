import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatKg } from "@/lib/utils";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#111", position: "relative" },
  watermarkContainer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: -1 },
  watermarkImage: { width: 350, opacity: 0.06 },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#111", paddingBottom: 10 },
  siteName: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  orgLine: { fontSize: 8, color: "#333", marginTop: 1 },
  qr: { width: 70, height: 70 },
  ticketTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 4 },
  ticketTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  typeBadge: { fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 1, borderWidth: 1, borderColor: "#111", paddingVertical: 2, paddingHorizontal: 6 },
  ticketNumber: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  row: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#ddd", paddingVertical: 5 },
  fieldLabel: { width: "34%", fontSize: 8, color: "#555" },
  fieldValue: { width: "66%", fontSize: 9, fontFamily: "Helvetica-Bold" },
  section: { marginTop: 10 },
  weights: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 14, marginTop: 10, borderTopWidth: 2, borderBottomWidth: 2, borderColor: "#111" },
  weightLabel: { fontSize: 8, color: "#555", textTransform: "uppercase", letterSpacing: 1 },
  weightValue: { fontSize: 19, fontFamily: "Helvetica-Bold", marginTop: 3 },
  signatures: { flexDirection: "row", justifyContent: "space-between", marginTop: 22 },
  signatureBlock: { width: "45%" },
  signatureLabel: { fontSize: 8, color: "#555" },
  signatureName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 2 },
  signatureLine: { borderTopWidth: 1, borderTopColor: "#111", marginTop: 22, paddingTop: 3, fontSize: 8, color: "#555" },
  copyLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 1, textAlign: "center", backgroundColor: "#111", color: "#fff", paddingVertical: 4, marginBottom: 8 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 20, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#ccc" },
  footerText: { fontSize: 7, color: "#666" },
  hash: { fontSize: 6, fontFamily: "Courier", color: "#888", marginTop: 2 },
});

export interface WaybillDocumentProps {
  waybillNumber: string;
  transactionType: "DISPATCH" | "RECEIPT" | null;
  copyLabel: string;
  siteName: string;
  siteAddress: string;
  organisationName: string;
  organisationPhone: string | null;
  organisationRegNo: string | null;
  vehiclePlate: string;
  trailerReg: string | null;
  operatorName: string;
  transportCompany: string;
  dateTimeIn: string | null;
  dateTimeOut: string | null;
  supplierOrigin: string;
  destination: string;
  product: string;
  purchaseOrderNo: string;
  externalRef: string;
  stockpileRef: string;
  comment: string;
  driverName: string;
  driverLicenceNumber: string;
  grossWeightKg: number;
  tareWeightKg: number;
  netWeightKg: number;
  overload: boolean;
  overloadVarianceKg: number;
  integrityHash: string;
  qrDataUrl: string;
  logoDataUrl?: string;
}

function Field({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.fieldValue}>{value || "—"}</Text></View>;
}

function Weight({ label, value }: { label: string; value: string }) {
  return <View><Text style={styles.weightLabel}>{label}</Text><Text style={styles.weightValue}>{value}</Text></View>;
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
        <Text style={styles.copyLabel}>{props.copyLabel}</Text>
        <View style={styles.header}>
          <View>
            <Text style={styles.siteName}>{props.siteName}</Text>
            <Text style={styles.orgLine}>{props.siteAddress}</Text>
            <Text style={styles.orgLine}>{props.organisationName}{props.organisationPhone ? ` · ${props.organisationPhone}` : ""}</Text>
            {props.organisationRegNo && <Text style={styles.orgLine}>Reg. No: {props.organisationRegNo}</Text>}
          </View>
          <Image src={props.qrDataUrl} style={styles.qr} />
        </View>

        <View style={styles.ticketTitleRow}>
          <Text style={styles.ticketTitle}>WEIGHBRIDGE TICKET</Text>
          {props.transactionType && <Text style={styles.typeBadge}>{props.transactionType}</Text>}
        </View>
        <Text style={styles.ticketNumber}>{props.waybillNumber}</Text>

        <View style={styles.section}>
          <Field label="Reg No" value={props.vehiclePlate} />
          <Field label="Trailer" value={props.trailerReg ?? ""} />
          <Field label="Operator" value={props.operatorName} />
          <Field label="Transport Company" value={props.transportCompany} />
          <Field label="Date & Time In" value={props.dateTimeIn ?? ""} />
          <Field label="Date & Time Out" value={props.dateTimeOut ?? ""} />
          <Field label="Supplier / Origin" value={props.supplierOrigin} />
          <Field label="Destination" value={props.destination} />
          <Field label="Product" value={props.product} />
          <Field label="Order No." value={props.purchaseOrderNo} />
          <Field label="External Ref" value={props.externalRef} />
          <Field label="Stockpile Ref" value={props.stockpileRef} />
          <Field label="Comment" value={props.comment} />
        </View>

        <View style={styles.weights}>
          <Weight label="Tare" value={formatKg(props.tareWeightKg)} />
          <Weight label="Gross" value={formatKg(props.grossWeightKg)} />
          <Weight label="Nett" value={formatKg(props.netWeightKg)} />
        </View>
        <Field label="Load status" value={props.overload ? `FAIL — variance ${formatKg(props.overloadVarianceKg)}` : "PASS"} />

        <View style={styles.signatures}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>Driver</Text>
            <Text style={styles.signatureName}>{props.driverName}</Text>
            <Text style={styles.orgLine}>Licence {props.driverLicenceNumber}</Text>
            <Text style={styles.signatureLine}>Sign</Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>Operator</Text>
            <Text style={styles.signatureName}>{props.operatorName}</Text>
            <Text style={styles.signatureLine}>Sign</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View>
            <Text style={styles.footerText}>This ticket is protected by a SHA-256 integrity hash. Verify using the QR code.</Text>
            <Text style={styles.hash}>{props.integrityHash}</Text>
          </View>
          <Text style={styles.footerText}>Digital Weighbridge Platform</Text>
        </View>
      </Page>
    </Document>
  );
}
