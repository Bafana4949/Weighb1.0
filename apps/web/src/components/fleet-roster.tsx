"use client";
import { useRef, useState } from "react";
import { read, utils } from "xlsx";
import { UploadCloud, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/providers";

type RosterEntry = {
  id: string;
  vehicle: { plate: string };
  trailer1: { trailerId: string; registrationNo: string | null } | null;
  trailer2: { trailerId: string; registrationNo: string | null } | null;
  driver: { firstName: string; lastName: string; idNumberHash: string };
  organisation: { name: string };
  rosterDate: string;
};

/** Minimal hand-rolled CSV parser: comma-separated, header row, double-quote escaping. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  function splitLine(line: string): string[] {
    const cells: string[] = []; let current = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (char === '"') inQuotes = false;
        else current += char;
      } else if (char === '"') inQuotes = true;
      else if (char === ",") { cells.push(current); current = ""; }
      else current += char;
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
  }
  const headers = splitLine(lines[0]!);
  return lines.slice(1).map((line) => Object.fromEntries(splitLine(line).map((value, i) => [headers[i], value])));
}

async function parseFile(file: File): Promise<Record<string, any>[]> {
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    const buffer = await file.arrayBuffer();
    const workbook = read(buffer);
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) return [];
    return utils.sheet_to_json(sheet, { defval: "" });
  } else {
    return parseCsv(await file.text());
  }
}

export function FleetRoster({ currentRoster }: { currentRoster: RosterEntry[] }) {
  const [busy, setBusy] = useState(false);
  const [roster, setRoster] = useState<RosterEntry[]>(currentRoster);
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      const parsedRows = await parseFile(file);
      const rows = parsedRows.map((row) => ({
        truckRegistration: row["Truck Registration"] ? String(row["Truck Registration"]) : undefined,
        trailer1: row["Trailer 1"] ? String(row["Trailer 1"]) : undefined,
        trailer2: row["Trailer 2"] ? String(row["Trailer 2"]) : undefined,
        driverName: row["Driver Name"] ? String(row["Driver Name"]) : undefined,
        driverId: row["Driver ID/Passport"] ? String(row["Driver ID/Passport"]) : undefined,
      }));

      const response = await fetch("/api/roster/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to upload roster");
      }

      setImportResult(body.data);
      if (body.data.created > 0) {
        toast({ title: "Roster updated", body: `Successfully processed ${body.data.created} entries.` });
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch (error) {
      toast({ title: "Upload failed", body: String(error), severity: "HIGH" });
    } finally {
      setBusy(false);
      e.target.value = ""; // Reset input
    }
  }

  function downloadTemplate() {
    const headers = ["Truck Registration", "Trailer 1", "Trailer 2", "Driver Name", "Driver ID/Passport", "Company"];
    const csvContent = headers.join(",") + "\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "daily-fleet-roster-template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Daily Fleet List</CardTitle>
          <CardDescription>
            Upload your daily list of available trucks, trailers, and drivers. 
            Clients will assign orders to the fleet you make available here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Button variant="outline" onClick={downloadTemplate}>
              Download CSV Template
            </Button>
            <div className="relative">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileUpload}
                disabled={busy}
                className="absolute inset-0 z-50 h-full w-full cursor-pointer opacity-0"
              />
              <Button disabled={busy} className="w-full sm:w-auto">
                <UploadCloud size={16} className="mr-2" />
                {busy ? "Processing..." : "Upload Fleet List"}
              </Button>
            </div>
          </div>
          {importResult && (
            <div className="mt-4 rounded-sm border border-border p-3 text-xs">
              <p className="font-medium text-foreground">{importResult.created} record{importResult.created === 1 ? "" : "s"} imported</p>
              {importResult.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-danger">
                  {importResult.errors.map((e, i) => (
                    <li key={i}>Row {e.row}: {e.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Today's Available Fleet</CardTitle>
          <CardDescription>
            {new Date().toLocaleDateString("en-ZA", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Truck</TableHead>
                <TableHead>Trailer 1</TableHead>
                <TableHead>Trailer 2</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Company</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.length ? roster.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono">{entry.vehicle.plate}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{entry.trailer1?.trailerId ?? "—"}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{entry.trailer2?.trailerId ?? "—"}</TableCell>
                  <TableCell>{entry.driver.firstName} {entry.driver.lastName}</TableCell>
                  <TableCell className="text-muted-foreground">{entry.organisation.name}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                    You haven't uploaded a fleet roster for today.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
