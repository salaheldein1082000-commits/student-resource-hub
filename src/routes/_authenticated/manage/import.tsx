import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ShieldAlert,
  Upload,
  XCircle,
} from "lucide-react";
import { portalClassesQuery, portalDb } from "@/lib/portal";
import { meQuery } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/AppShell";
import { isValidStudentCode } from "@/lib/studentCode";

const MAX_IMPORT_ROWS = 21;
const CSV_HEADERS = ["student_code", "full_name"] as const;

type StudentRow = {
  student_code: string;
  full_name: string;
};

type ImportOutcome = StudentRow & {
  temporary_password: string | null;
  created: boolean;
  error: string | null;
};

export const Route = createFileRoute("/_authenticated/manage/import")({
  head: () => ({
    meta: [
      { title: "Import students — Unit 1 IT Infrastructure" },
      {
        name: "description",
        content: "Securely import BTEC students into a class from a CSV file.",
      },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: "/dashboard" });

    const { data: profile } = await portalDb
      .from("profiles")
      .select("role")
      .eq("id", me.id)
      .maybeSingle();
    if (me.role !== "unit_leader" || profile?.role !== "unit_leader") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: StudentImport,
});

function parseCsvText(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\r" || character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("The CSV contains an unfinished quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function StudentImport() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    data: classes = [],
    isLoading: classesLoading,
    error: classesError,
  } = useQuery(portalClassesQuery);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [fileName, setFileName] = useState("");
  const [studentRows, setStudentRows] = useState<StudentRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const selectedClass = classes.find((item) => item.id === selectedClassId);
  const canSubmit = Boolean(
    selectedClassId &&
    selectedClass &&
    studentRows.length > 0 &&
    studentRows.length <= selectedClass.capacity &&
    validationErrors.length === 0 &&
    !isImporting,
  );

  function resetImportPreview() {
    setOutcomes([]);
    setValidationErrors([]);
    setStudentRows([]);
    setFileName("");
  }

  async function readFile(file: File) {
    resetImportPreview();
    setFileName(file.name);
    setIsReading(true);
    try {
      const rows = parseCsvText(await file.text());
      const errors: string[] = [];
      const dataRows = rows.slice(1).filter((row) => !(row.length === 1 && row[0]?.trim() === ""));
      const headers = rows[0] ?? [];

      if (
        headers.length !== CSV_HEADERS.length ||
        headers.some((value, index) => value !== CSV_HEADERS[index])
      ) {
        errors.push("The CSV header must be exactly: student_code,full_name.");
      }
      if (dataRows.length === 0) errors.push("Add at least one student row to the CSV.");
      if (dataRows.length > MAX_IMPORT_ROWS)
        errors.push(`Choose no more than ${MAX_IMPORT_ROWS} student rows.`);

      const parsedRows = dataRows.map((row, index) => ({
        student_code: row[0]?.trim() ?? "",
        full_name: row[1]?.trim() ?? "",
        rowNumber: index + 2,
        fieldCount: row.length,
      }));
      const seenCodes = new Map<string, number>();
      for (const row of parsedRows) {
        if (row.fieldCount !== 2)
          errors.push(`Row ${row.rowNumber}: expected exactly two columns.`);
        if (!isValidStudentCode(row.student_code)) {
          errors.push(`Row ${row.rowNumber}: student_code must contain exactly 6 digits.`);
        }
        if (row.full_name.length < 2 || row.full_name.length > 120) {
          errors.push(`Row ${row.rowNumber}: full_name must be between 2 and 120 characters.`);
        }
        const previousRow = seenCodes.get(row.student_code);
        if (previousRow !== undefined && row.student_code !== "") {
          errors.push(
            `Rows ${previousRow} and ${row.rowNumber}: duplicate student code ${row.student_code}.`,
          );
        } else if (row.student_code !== "") {
          seenCodes.set(row.student_code, row.rowNumber);
        }
      }

      setStudentRows(
        parsedRows.map(({ student_code, full_name }) => ({ student_code, full_name })),
      );
      setValidationErrors(errors);
      if (errors.length > 0) toast.error("Review the CSV validation errors before importing.");
      else
        toast.success(
          `${dataRows.length} student row${dataRows.length === 1 ? "" : "s"} ready to import.`,
        );
    } catch (error) {
      const message = error instanceof Error ? error.message : "The CSV could not be read.";
      setValidationErrors([message]);
      toast.error(message);
    } finally {
      setIsReading(false);
    }
  }

  async function importStudents() {
    if (!canSubmit) {
      toast.error("Choose a class and a valid CSV before importing.");
      return;
    }
    setIsImporting(true);
    setOutcomes([]);
    const { data, error } = await portalDb.rpc("import_students", {
      _class_id: selectedClassId,
      _students: studentRows,
    });
    setIsImporting(false);

    if (error) {
      toast.error(error.message || "Student import failed.");
      return;
    }

    const result = (data ?? []) as ImportOutcome[];
    setOutcomes(result);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["portal", "classes"] }),
      queryClient.invalidateQueries({ queryKey: ["portal", "profiles"] }),
    ]);
    if (result.some((row) => row.error)) toast.warning("Import completed with some row errors.");
    else toast.success("Students imported successfully.");
  }

  function downloadCredentials() {
    const credentialRows = outcomes.filter((row) => row.temporary_password);
    if (credentialRows.length === 0) return;
    const lines = [
      "student_code,full_name,password",
      ...credentialRows.map((row) =>
        [row.student_code, row.full_name, row.temporary_password ?? ""].map(csvCell).join(","),
      ),
    ];
    downloadCsv("student-login-credentials.csv", `${lines.join("\r\n")}\r\n`);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Import students"
        sub="Add students to a class from a CSV file (up to that class’s capacity)."
      >
        <Button
          variant="outline"
          onClick={() => downloadCsv("student-import-template.csv", "student_code,full_name\r\n")}
        >
          <Download className="mr-2 h-4 w-4" /> Download template
        </Button>
      </PageHeader>

      <div className="mb-6 flex gap-3 rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          <strong>Student codes remain the passwords.</strong> The portal does not require a
          password change. Six-digit passwords are easy to guess, so share each code only through an
          approved secure channel.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <section
          className="space-y-5 rounded-xl border bg-card p-5 shadow-card"
          aria-labelledby="import-form-heading"
        >
          <div>
            <h2 id="import-form-heading" className="text-lg font-semibold">
              1. Choose a class
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Each imported student account will use the student code as its password, including
              accounts that already exist.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="class">Class</Label>
            <Select
              value={selectedClassId}
              onValueChange={setSelectedClassId}
              disabled={classesLoading || classes.length === 0}
            >
              <SelectTrigger id="class" aria-label="Choose a class">
                <SelectValue placeholder={classesLoading ? "Loading classes…" : "Select a class"} />
              </SelectTrigger>
              <SelectContent>
                {classes.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} · Unit {item.unit_no}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {classesError && (
              <p className="text-sm text-destructive">
                Could not load classes: {classesError.message}
              </p>
            )}
            {selectedClass && (
              <p className="text-xs text-muted-foreground">
                Class capacity: {selectedClass.capacity} students.
              </p>
            )}
          </div>

          <div className="border-t pt-5">
            <h2 className="text-lg font-semibold">2. Upload CSV</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Required headers:{" "}
              <code className="rounded bg-muted px-1">student_code,full_name</code>. Student codes
              must be exactly 6 digits.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void readFile(file);
              }}
            />
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isReading}
            >
              <Upload className="mr-2 h-4 w-4" /> {isReading ? "Reading CSV…" : "Choose CSV file"}
            </Button>
            {fileName && (
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                {fileName}
              </p>
            )}
          </div>

          {validationErrors.length > 0 && (
            <div
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
              role="alert"
            >
              <p className="font-semibold text-destructive">
                Fix these CSV issues before importing:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
                {validationErrors.map((error, index) => (
                  <li key={`${error}-${index}`}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <p className="text-sm text-muted-foreground">
              {studentRows.length > 0
                ? `${studentRows.length} row${studentRows.length === 1 ? "" : "s"} loaded`
                : "No CSV loaded"}
            </p>
            <Button onClick={() => void importStudents()} disabled={!canSubmit}>
              {isImporting ? "Importing…" : "Import students"}
            </Button>
          </div>
        </section>

        <aside className="rounded-xl border bg-muted/30 p-5 text-sm">
          <h2 className="font-semibold">CSV checklist</h2>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li>
              • Use one header row: <code>student_code,full_name</code>
            </li>
            <li>• Use a 6-digit student code.</li>
            <li>• Use the student&apos;s full name (2–120 characters).</li>
            <li>
              • Do not exceed the selected class&apos;s capacity (20, or 21 for the 21-seat class).
            </li>
            <li>• Duplicate codes and invalid rows are blocked before submission.</li>
          </ul>
        </aside>
      </div>

      {outcomes.length > 0 && (
        <section
          className="mt-8 rounded-xl border bg-card p-5 shadow-card"
          aria-labelledby="results-heading"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="results-heading" className="text-lg font-semibold">
                Import results
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every imported student uses their six-digit code as the password.
              </p>
            </div>
            {outcomes.some((row) => row.temporary_password) && (
              <Button variant="outline" onClick={downloadCredentials}>
                <Download className="mr-2 h-4 w-4" /> Download student login CSV
              </Button>
            )}
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Password</th>
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {outcomes.map((row) => (
                  <tr key={`${row.student_code}-${row.full_name}`}>
                    <td className="px-3 py-3">
                      <span className="font-mono">{row.student_code}</span>
                      <br />
                      <span>{row.full_name}</span>
                    </td>
                    <td className="px-3 py-3">
                      {row.error ? (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <XCircle className="h-4 w-4" /> Not imported
                        </span>
                      ) : row.created ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" /> Created
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4" /> Existing, password set
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono">{row.temporary_password ?? "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {row.error ??
                        (row.created
                          ? "New account created; the student code remains its password."
                          : "Existing student account assigned to this class; password set to the student code.")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm font-medium text-amber-800 dark:text-amber-300">
            No first-login password change is required. The student code is the account password.
          </p>
        </section>
      )}
    </div>
  );
}
