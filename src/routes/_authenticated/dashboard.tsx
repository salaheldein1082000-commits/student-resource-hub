import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { ArrowRight, Download, Filter } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/AppShell";
import { useMe } from "@/lib/auth";
import { useLocale } from "@/lib/locale";
import {
  getLatestAttempt,
  portalAssignmentsQuery,
  portalClassesQuery,
  portalDb,
  portalProfilesQuery,
  portalSubmissionsQuery,
  submissionStatusLabel,
  type PortalSubmission,
} from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — BTEC Assessment Portal" },
      {
        name: "description",
        content: "Unit 1 assignments, class submissions and assessment progress.",
      },
      { property: "og:title", content: "Dashboard — BTEC Assessment Portal" },
      { property: "og:description", content: "BTEC Unit 1 assignments and assessment progress." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useMe();
  if (!me) return null;
  return me.role === "student" ? <StudentDashboard name={me.name} /> : <StaffDashboard />;
}

function StudentDashboard({ name }: { name: string }) {
  const { t } = useLocale();
  const { data: assignments = [], isLoading } = useQuery(portalAssignmentsQuery);
  const { data: submissions = [] } = useQuery(portalSubmissionsQuery);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`${t("hello")}, ${name.split(" ")[0]}`} sub={t("yourAssignments")} />
      {isLoading ? (
        <p className="text-muted-foreground">{t("loading")}</p>
      ) : assignments.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-muted-foreground">{t("noAssignments")}</p>
      ) : (
        <div className="space-y-3">
          {assignments.map((assignment) => {
            const attempts = submissions.filter((item) => item.assignment_id === assignment.id);
            const latest = getLatestAttempt(attempts);
            const label = latest ? statusLabel(latest.status, t) : t("notSubmitted");
            const badgeClass = latest
              ? latest.status === "graded"
                ? "bg-success text-success-foreground"
                : latest.status === "resubmission_allowed"
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary text-secondary-foreground"
              : "border-dashed";
            return (
              <Link
                key={assignment.id}
                to="/assignments/$id"
                params={{ id: assignment.id }}
                className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-card transition hover:border-primary"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-bold">{assignment.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {assignment.due_date
                      ? `${t("due")} ${format(new Date(`${assignment.due_date}T12:00:00`), "d MMM yyyy")}`
                      : t("noDeadline")}
                    {assignment.criteria.length > 0 &&
                      ` · ${assignment.criteria.map((c) => c.code).join(", ")}`}
                  </p>
                </div>
                <Badge variant="outline" className={badgeClass}>
                  {label}
                </Badge>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StaffDashboard() {
  const { data: me } = useMe();
  const { t } = useLocale();
  const { data: submissions = [], isLoading } = useQuery(portalSubmissionsQuery);
  const { data: assignments = [] } = useQuery(portalAssignmentsQuery);
  const { data: classes = [] } = useQuery(portalClassesQuery);
  const { data: profiles = [] } = useQuery(portalProfilesQuery);
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const isLeader = me?.role === "unit_leader";

  const filtered = submissions.filter(
    (item) =>
      (assignmentFilter === "all" || item.assignment_id === assignmentFilter) &&
      (classFilter === "all" || item.profiles?.class_id === classFilter) &&
      (statusFilter === "all" || item.status === statusFilter),
  );
  const students = profiles.filter((p) => p.role === "student");
  const awaiting = submissions.filter((item) => item.status === "submitted").length;

  async function exportGrades() {
    try {
      const { data, error } = await portalDb
        .from("gradings")
        .select("submission_id, criterion_id, achieved");
      if (error) throw error;
      const allCriteria = assignments.flatMap((item) => item.criteria);
      const criterionById = new Map(allCriteria.map((item) => [item.id, item]));
      const gradesBySubmission = new Map<string, Record<string, string>>();
      for (const row of data ?? []) {
        const criterion = criterionById.get(row.criterion_id);
        if (!criterion) continue;
        const values = gradesBySubmission.get(row.submission_id) ?? {};
        values[criterion.code] = row.achieved ? "Yes" : "No";
        gradesBySubmission.set(row.submission_id, values);
      }
      const criteriaCodes = [...new Set(allCriteria.map((item) => item.code))].sort();
      const rows = filtered.map((item) => {
        const values = gradesBySubmission.get(item.id) ?? {};
        const className = classes.find((group) => group.id === item.profiles?.class_id)?.name ?? "";
        return {
          Student: item.profiles?.full_name ?? item.profiles?.email ?? item.student_id,
          Class: className,
          Assignment: item.assignments?.title ?? "",
          Attempt: item.attempt_no,
          Status: submissionStatusLabel(item.status),
          Submitted: item.submitted_at
            ? format(new Date(item.submitted_at), "yyyy-MM-dd HH:mm")
            : "",
          ...Object.fromEntries(criteriaCodes.map((code) => [code, values[code] ?? ""])),
        };
      });
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!cols"] = [
        { wch: 26 },
        { wch: 16 },
        { wch: 38 },
        { wch: 10 },
        { wch: 24 },
        { wch: 22 },
        ...criteriaCodes.map(() => ({ wch: 10 })),
      ];
      XLSX.utils.book_append_sheet(workbook, sheet, "Grades");
      XLSX.writeFile(workbook, `btec-unit1-grades-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export the grades sheet.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={isLeader ? "Unit Leader dashboard" : "Engineer dashboard"}
        sub={
          isLeader
            ? "Overview across all classes and submissions."
            : "Submissions from your assigned classes."
        }
      >
        <Button variant="outline" onClick={exportGrades} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> Export Excel
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("classes")} value={classes.length} />
        <Stat label={t("students")} value={students.length} />
        <Stat label={t("submissions")} value={submissions.length} />
        <Stat label="Awaiting assessment" value={awaiting} />
      </div>

      {isLeader && (
        <div className="mt-5 rounded-xl border bg-card p-5 shadow-card">
          <p className="font-semibold">Class allocation</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {classes.filter((group) => group.engineer_id).length} of {classes.length} classes have
            an Engineer assigned. {students.length} of {classes.length * 20} roster places are
            currently assigned.
          </p>
          <Link
            to="/manage/classes"
            className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline"
          >
            {t("classes")} →
          </Link>
        </div>
      )}

      <div className="mt-10 flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-xl font-bold">{t("submissions")}</h2>
      </div>
      <div className="my-4 grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("filterAssignment")}
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"
            value={assignmentFilter}
            onChange={(e) => setAssignmentFilter(e.target.value)}
          >
            <option value="all">{t("all")}</option>
            {assignments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("filterClass")}
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="all">{t("all")}</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("filterStatus")}
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">{t("all")}</option>
            <option value="submitted">{t("submitted")}</option>
            <option value="graded">{t("graded")}</option>
            <option value="resubmission_allowed">{t("resubmissionAllowed")}</option>
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        {isLoading ? (
          <p className="p-6 text-muted-foreground">{t("loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-muted-foreground">{t("noSubmissions")}</p>
        ) : (
          <div className="divide-y">
            {filtered.map((item) => (
              <SubmissionRow
                key={item.id}
                item={item}
                className={classes.find((group) => group.id === item.profiles?.class_id)?.name}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SubmissionRow({
  item,
  className,
}: {
  item: PortalSubmission;
  className?: string | undefined;
}) {
  const { t } = useLocale();
  const variant =
    item.status === "graded"
      ? "bg-success text-success-foreground"
      : item.status === "resubmission_allowed"
        ? "bg-accent text-accent-foreground"
        : "bg-secondary text-secondary-foreground";
  return (
    <Link
      to="/manage/submissions/$id"
      params={{ id: item.id }}
      className="flex flex-wrap items-center gap-4 p-4 transition hover:bg-muted"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {item.profiles?.full_name ?? item.profiles?.email ?? item.student_id}
        </p>
        <p className="text-sm text-muted-foreground">
          {className ?? item.profiles?.group_name ?? t("unassigned")} · {item.assignments?.title} ·{" "}
          {t("attempt")} {item.attempt_no}
        </p>
      </div>
      <span className="text-sm text-muted-foreground">
        {item.submitted_at ? format(new Date(item.submitted_at), "d MMM, HH:mm") : ""}
      </span>
      <Badge variant="outline" className={variant}>
        {statusLabel(item.status, t)}
      </Badge>
    </Link>
  );
}

function statusLabel(status: PortalSubmission["status"], t: ReturnType<typeof useLocale>["t"]) {
  if (status === "graded") return t("graded");
  if (status === "resubmission_allowed") return t("resubmissionAllowed");
  return t("submitted");
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold">{value}</p>
    </div>
  );
}
