import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 16, fontSize: 6, fontFamily: "Helvetica", color: "#111" },
  header: { borderBottomWidth: 2, borderBottomColor: "#111", paddingBottom: 6, marginBottom: 8, flexDirection: "row", justifyContent: "space-between" },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 8, color: "#333", marginTop: 2 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#111", paddingBottom: 3, marginBottom: 2 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 2 },
  th: { fontSize: 5, fontFamily: "Helvetica-Bold", color: "#333", paddingRight: 2 },
  td: { fontSize: 5, paddingRight: 2 },
  footer: { position: "absolute", bottom: 10, left: 16, right: 16, fontSize: 6, color: "#666", borderTopWidth: 1, borderTopColor: "#ccc", paddingTop: 4, flexDirection: "row", justifyContent: "space-between" },
  summaryRow: { flexDirection: "row", marginTop: 10, borderTopWidth: 1, borderTopColor: "#111", paddingTop: 6 },
  stat: { marginRight: 20 },
  statLabel: { fontSize: 6, color: "#555", textTransform: "uppercase" },
  statValue: { fontSize: 8, fontFamily: "Helvetica-Bold", marginTop: 1 },
});

export interface TransactionDocumentProps {
  organisationName: string;
  from: string;
  to: string;
  rows: any[];
  totalNet: number;
  totalGross: number;
  totalTare: number;
  avgNet: number;
  avgTime: string;
  generatedAt: string;
}

export function TransactionDocument(props: TransactionDocumentProps) {
  // Columns width distribution (total 100%)
  const w = {
    c1: "5%", c2: "4%", c3: "3%", c4: "5%", c5: "5%", c6: "5%", c7: "4%", c8: "4%", c9: "5%", c10: "5%",
    c11: "4%", c12: "4%", c13: "3%", c14: "4%", c15: "3%", c16: "4%", c17: "4%", c18: "4%", c19: "4%", c20: "5%",
    c21: "4%", c22: "4%", c23: "4%"
  };

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{props.organisationName} - Transaction Report</Text>
            <Text style={styles.subtitle}>{props.from} to {props.to}</Text>
          </View>
        </View>

        <View style={styles.tableHeader} fixed>
          <Text style={[styles.th, { width: w.c1 }]}>Tran No</Text>
          <Text style={[styles.th, { width: w.c2 }]}>Date</Text>
          <Text style={[styles.th, { width: w.c3 }]}>Time</Text>
          <Text style={[styles.th, { width: w.c4 }]}>Order No</Text>
          <Text style={[styles.th, { width: w.c5 }]}>Supplier</Text>
          <Text style={[styles.th, { width: w.c6 }]}>Customer</Text>
          <Text style={[styles.th, { width: w.c7 }]}>Type</Text>
          <Text style={[styles.th, { width: w.c8 }]}>Material</Text>
          <Text style={[styles.th, { width: w.c9 }]}>Destination</Text>
          <Text style={[styles.th, { width: w.c10 }]}>Source</Text>
          <Text style={[styles.th, { width: w.c11 }]}>Truck</Text>
          <Text style={[styles.th, { width: w.c12 }]}>Gr Date</Text>
          <Text style={[styles.th, { width: w.c13 }]}>Gr Time</Text>
          <Text style={[styles.th, { width: w.c14 }]}>Ta Date</Text>
          <Text style={[styles.th, { width: w.c15 }]}>Ta Time</Text>
          <Text style={[styles.th, { width: w.c16 }]}>Nett</Text>
          <Text style={[styles.th, { width: w.c17 }]}>Gross</Text>
          <Text style={[styles.th, { width: w.c18 }]}>Tare</Text>
          <Text style={[styles.th, { width: w.c19 }]}>Tot Time</Text>
          <Text style={[styles.th, { width: w.c20 }]}>Transporter</Text>
          <Text style={[styles.th, { width: w.c21 }]}>Mine No</Text>
          <Text style={[styles.th, { width: w.c22 }]}>Mine Mass</Text>
          <Text style={[styles.th, { width: w.c23 }]}>Driver</Text>
        </View>

        {props.rows.map((r, i) => (
          <View key={i} style={styles.tableRow} wrap={false}>
            <Text style={[styles.td, { width: w.c1 }]}>{r.transactionNo}</Text>
            <Text style={[styles.td, { width: w.c2 }]}>{r.transactionDate}</Text>
            <Text style={[styles.td, { width: w.c3 }]}>{r.transactionTime}</Text>
            <Text style={[styles.td, { width: w.c4 }]}>{r.orderNo}</Text>
            <Text style={[styles.td, { width: w.c5 }]}>{r.supplier}</Text>
            <Text style={[styles.td, { width: w.c6 }]}>{r.customer}</Text>
            <Text style={[styles.td, { width: w.c7 }]}>{r.transactionType}</Text>
            <Text style={[styles.td, { width: w.c8 }]}>{r.material}</Text>
            <Text style={[styles.td, { width: w.c9 }]}>{r.destination}</Text>
            <Text style={[styles.td, { width: w.c10 }]}>{r.source}</Text>
            <Text style={[styles.td, { width: w.c11 }]}>{r.truckNo}</Text>
            <Text style={[styles.td, { width: w.c12 }]}>{r.grossDate}</Text>
            <Text style={[styles.td, { width: w.c13 }]}>{r.grossTime}</Text>
            <Text style={[styles.td, { width: w.c14 }]}>{r.tareDate}</Text>
            <Text style={[styles.td, { width: w.c15 }]}>{r.tareTime}</Text>
            <Text style={[styles.td, { width: w.c16 }]}>{r.netWeight}</Text>
            <Text style={[styles.td, { width: w.c17 }]}>{r.grossWeight}</Text>
            <Text style={[styles.td, { width: w.c18 }]}>{r.tareWeight}</Text>
            <Text style={[styles.td, { width: w.c19 }]}>{r.totalTransactionTime}</Text>
            <Text style={[styles.td, { width: w.c20 }]}>{r.transporter}</Text>
            <Text style={[styles.td, { width: w.c21 }]}>{r.mineTicketNo}</Text>
            <Text style={[styles.td, { width: w.c22 }]}>{r.mineTicketMass}</Text>
            <Text style={[styles.td, { width: w.c23 }]}>{r.driver}</Text>
          </View>
        ))}

        <View style={styles.summaryRow} wrap={false}>
          <View style={styles.stat}><Text style={styles.statLabel}>Transactions</Text><Text style={styles.statValue}>{props.rows.length}</Text></View>
          <View style={styles.stat}><Text style={styles.statLabel}>Total Nett</Text><Text style={styles.statValue}>{props.totalNet.toLocaleString()} kg</Text></View>
          <View style={styles.stat}><Text style={styles.statLabel}>Total Gross</Text><Text style={styles.statValue}>{props.totalGross.toLocaleString()} kg</Text></View>
          <View style={styles.stat}><Text style={styles.statLabel}>Total Tare</Text><Text style={styles.statValue}>{props.totalTare.toLocaleString()} kg</Text></View>
          <View style={styles.stat}><Text style={styles.statLabel}>Avg Nett</Text><Text style={styles.statValue}>{Math.round(props.avgNet).toLocaleString()} kg</Text></View>
          <View style={styles.stat}><Text style={styles.statLabel}>Avg Turnaround</Text><Text style={styles.statValue}>{props.avgTime}</Text></View>
        </View>

        <View style={styles.footer} fixed>
          <Text>Generated {props.generatedAt} · Digital Weighbridge Platform</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
