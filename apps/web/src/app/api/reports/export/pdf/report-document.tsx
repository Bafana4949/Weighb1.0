import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  header: { borderBottomWidth: 2, borderBottomColor: "#111", paddingBottom: 10, marginBottom: 12 },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 8, color: "#333", marginTop: 2 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  stat: { width: "23%" },
  statLabel: { fontSize: 7, color: "#555", textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#111", paddingBottom: 3, marginBottom: 2 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 3 },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#333" },
  td: { fontSize: 8 },
  footer: { position: "absolute", bottom: 20, left: 28, right: 28, fontSize: 7, color: "#666", borderTopWidth: 1, borderTopColor: "#ccc", paddingTop: 6 },
});

export interface ReportDocumentProps {
  organisationName: string;
  from: string;
  to: string;
  trucks: number;
  totalTonnageT: string;
  averageLoadKg: string;
  averageTurnaroundMin: string;
  tonnageRows: Array<{ group: string; net_weight_kg: number; transactions: number }>;
  turnaroundRows: Array<{ site: string; average_seconds: number; maximum_seconds: number; transactions: number }>;
  generatedAt: string;
}

export function ReportDocument(props: ReportDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{props.organisationName}</Text>
          <Text style={styles.subtitle}>Operational performance report · {props.from} to {props.to}</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.stat}><Text style={styles.statLabel}>Trucks</Text><Text style={styles.statValue}>{props.trucks}</Text></View>
          <View style={styles.stat}><Text style={styles.statLabel}>Total tonnage</Text><Text style={styles.statValue}>{props.totalTonnageT} t</Text></View>
          <View style={styles.stat}><Text style={styles.statLabel}>Average load</Text><Text style={styles.statValue}>{props.averageLoadKg} kg</Text></View>
          <View style={styles.stat}><Text style={styles.statLabel}>Average turnaround</Text><Text style={styles.statValue}>{props.averageTurnaroundMin} min</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Tonnage by group</Text>
        <View style={styles.tableHeader}><Text style={[styles.th, { width: "50%" }]}>Group</Text><Text style={[styles.th, { width: "25%" }]}>Net tonnage</Text><Text style={[styles.th, { width: "25%" }]}>Trucks</Text></View>
        {props.tonnageRows.map((r) => (
          <View key={r.group} style={styles.tableRow}><Text style={[styles.td, { width: "50%" }]}>{r.group}</Text><Text style={[styles.td, { width: "25%" }]}>{(r.net_weight_kg / 1000).toFixed(1)} t</Text><Text style={[styles.td, { width: "25%" }]}>{r.transactions}</Text></View>
        ))}

        <Text style={styles.sectionTitle}>Turnaround by site</Text>
        <View style={styles.tableHeader}><Text style={[styles.th, { width: "40%" }]}>Site</Text><Text style={[styles.th, { width: "20%" }]}>Average</Text><Text style={[styles.th, { width: "20%" }]}>Maximum</Text><Text style={[styles.th, { width: "20%" }]}>Trucks</Text></View>
        {props.turnaroundRows.map((r) => (
          <View key={r.site} style={styles.tableRow}><Text style={[styles.td, { width: "40%" }]}>{r.site}</Text><Text style={[styles.td, { width: "20%" }]}>{Math.round(r.average_seconds / 60)} min</Text><Text style={[styles.td, { width: "20%" }]}>{Math.round(r.maximum_seconds / 60)} min</Text><Text style={[styles.td, { width: "20%" }]}>{r.transactions}</Text></View>
        ))}

        <View style={styles.footer}><Text>Generated {props.generatedAt} · Digital Weighbridge Platform</Text></View>
      </Page>
    </Document>
  );
}
