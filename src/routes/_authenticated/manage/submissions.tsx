import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/AppShell";
import { useLocale } from "@/lib/locale";
import {
  portalAssignmentsQuery,
  portalClassesQuery,
  portalSubmissionsQuery,
  type PortalSubmission,
} from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/manage/submissions")({
  head: () => ({ meta: [{ title: "Submissions — Unit 1 IT Infrastructure" }] }),
  component: SubmissionRoute,
});

function SubmissionRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return pathname.replace(/\/$/, "") === "/manage/submissions" ? <SubmissionList /> : <Outlet />;
}

function SubmissionList() {
  const { t } = useLocale();
  const { data: submissions = [], isLoading } = useQuery(portalSubmissionsQuery);
  const { data: assignments = [] } = useQuery(portalAssignmentsQuery);
  const { data: classes = [] } = useQuery(portalClassesQuery);
  const [assignmentId, setAssignmentId] = useState("all");
  const [classId, setClassId] = useState("all");
  const [status, setStatus] = useState("all");

  const rows = submissions.filter(
    (item) =>
      (assignmentId === "all" || item.assignment_id === assignmentId) &&
      (classId === "all" || item.profiles?.class_id === classId) &&
      (status === "all" || item.status === status),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t("submissions")}
        sub="Review and assess work from your permitted classes."
      />
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Filter className="h-4 w-4" /> Filters
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("filterAssignment")}
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"
            value={assignmentId}
            onChange={(event) => setAssignmentId(event.target.value)}
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
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
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
            value={status}
            onChange={(event) => setStatus(event.target.value)}
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
        ) : rows.length === 0 ? (
          <p className="p-6 text-muted-foreground">{t("noSubmissions")}</p>
        ) : (
          <div className="divide-y">
            {rows.map((item) => (
              <SubmissionLine
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

function SubmissionLine({
  item,
  className,
}: {
  item: PortalSubmission;
  className?: string | undefined;
}) {
  const { t } = useLocale();
  const color =
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
        {item.submitted_at ? format(new Date(item.submitted_at), "d MMM yyyy, HH:mm") : ""}
      </span>
      <Badge variant="outline" className={color}>
        {item.status === "graded"
          ? t("graded")
          : item.status === "resubmission_allowed"
            ? t("resubmissionAllowed")
            : t("submitted")}
      </Badge>
    </Link>
  );
}
