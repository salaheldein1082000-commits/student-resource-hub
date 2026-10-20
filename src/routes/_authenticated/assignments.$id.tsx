import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Download, FileText, Printer, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { useMe } from "@/lib/auth";
import { useLocale } from "@/lib/locale";
import { printFeedbackAsPdf } from "@/lib/feedbackPdf";
import {
  getLatestAttempt,
  isExternalUrl,
  openSubmissionFile,
  portalAssignmentsQuery,
  portalDb,
  portalSubmissionsQuery,
  submissionStatusLabel,
  type PortalAssignment,
  type PortalSubmission,
} from "@/lib/portal";
import { validateSubmissionFile } from "@/lib/submission";

export const Route = createFileRoute("/_authenticated/assignments/$id")({
  head: () => ({
    meta: [
      { title: "Assignment — Unit 1 IT Infrastructure" },
      {
        name: "description",
        content: "Submit Unit 1 coursework and read published assessment feedback.",
      },
    ],
  }),
  component: AssignmentPage,
});

function AssignmentPage() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const { t, locale } = useLocale();
  const qc = useQueryClient();
  const { data: assignments = [], isLoading: assignmentsLoading } =
    useQuery(portalAssignmentsQuery);
  const { data: submissions = [], isLoading: submissionsLoading } =
    useQuery(portalSubmissionsQuery);
  const assignment = assignments.find((item) => item.id === id);
  const mySubmissions = submissions.filter((item) => item.assignment_id === id);
  const latest = getLatestAttempt(mySubmissions);
  const feedbackQuery = useQuery({
    queryKey: ["portal", "published-feedback", id, mySubmissions.map((item) => item.id).join(",")],
    enabled: mySubmissions.length > 0,
    queryFn: async () => {
      const ids = mySubmissions.map((item) => item.id);
      const [summaries, gradings] = await Promise.all([
        portalDb.from("feedback_summary").select("*").in("submission_id", ids),
        portalDb.from("gradings").select("*").in("submission_id", ids),
      ]);
      if (summaries.error) throw summaries.error;
      if (gradings.error) throw gradings.error;
      return { summaries: summaries.data ?? [], gradings: gradings.data ?? [] };
    },
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const isPastDue = useMemo(() => {
    if (!assignment?.due_date) return false;
    return cairoLocalDate() > assignment.due_date;
  }, [assignment?.due_date]);
  const canSubmit = !!assignment && (!isPastDue || latest?.status === "resubmission_allowed");

  if (assignmentsLoading || submissionsLoading)
    return <p className="text-muted-foreground">{t("loading")}</p>;
  if (!assignment || !me || me.role !== "student") {
    return (
      <p className="rounded-xl border bg-card p-6 text-muted-foreground">
        Assignment not found or not available to this account.
      </p>
    );
  }

  async function openBrief() {
    if (!assignment?.brief_pdf_url) return;
    try {
      if (isExternalUrl(assignment.brief_pdf_url)) {
        window.open(assignment.brief_pdf_url, "_blank", "noopener,noreferrer");
      } else {
        await openSubmissionFile("briefs", assignment.brief_pdf_url);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the brief.");
    }
  }

  async function downloadSubmission(item: PortalSubmission) {
    try {
      await openSubmissionFile("submissions", item.file_url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the submission file.");
    }
  }

  async function submit() {
    const fileError = validateSubmissionFile(file);
    if (fileError) {
      toast.error(fileError);
      return;
    }
    if (!me || !assignment || !file || !canSubmit) return;

    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      const safeName = file.name.replace(/[^\w.-]/g, "_");
      const path = `${me.id}/${assignment.id}/${Date.now()}-${safeName}`;
      const contentType = file.name.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const upload = await supabase.storage.from("submissions").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType,
      });
      if (upload.error) throw upload.error;
      uploadedPath = path;

      const attemptNo = (latest?.attempt_no ?? 0) + 1;
      const insert = await portalDb.from("submissions").insert({
        assignment_id: assignment.id,
        student_id: me.id,
        file_url: path,
        submitted_at: new Date().toISOString(),
        attempt_no: attemptNo,
        status: "submitted",
      });
      if (insert.error) throw insert.error;

      toast.success(`${t("submitted")} · ${t("attempt")} ${attemptNo}`);
      setFile(null);
      await qc.invalidateQueries({ queryKey: ["portal", "submissions"] });
      await qc.invalidateQueries({ queryKey: ["portal", "published-feedback", id] });
    } catch (error) {
      if (uploadedPath) await supabase.storage.from("submissions").remove([uploadedPath]);
      toast.error(error instanceof Error ? error.message : "Submission failed.");
    } finally {
      setBusy(false);
    }
  }

  const feedback = feedbackQuery.data;
  const publishedSummaries =
    feedback?.summaries.filter((item: { published: boolean }) => item.published) ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={assignment.title}
        sub={`${assignment.part}/${assignment.total_parts} · ${assignment.due_date ? `${t("due")} ${format(new Date(`${assignment.due_date}T12:00:00`), "EEEE d MMMM yyyy")}` : t("noDeadline")}`}
      >
        {assignment.brief_pdf_url && (
          <Button variant="outline" onClick={openBrief}>
            <Download className="h-4 w-4" /> {t("downloadBrief")}
          </Button>
        )}
      </PageHeader>

      {assignment.brief && (
        <p className="mb-6 whitespace-pre-wrap rounded-xl border bg-card p-5 shadow-card">
          {assignment.brief}
        </p>
      )}
      {assignment.criteria.length > 0 && (
        <section className="mb-8 rounded-xl border bg-card p-5 shadow-card">
          <h2 className="mb-3 text-lg font-bold">{t("criteria")}</h2>
          <div className="space-y-2">
            {assignment.criteria.map((criterion) => (
              <div key={criterion.id} className="flex gap-3 text-sm">
                <span className="w-14 shrink-0 font-mono font-semibold">{criterion.code}</span>
                <span className="text-muted-foreground">{criterion.description}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {canSubmit ? (
        <section className="mb-10 rounded-xl border bg-card p-6 shadow-card">
          <h2 className="mb-2 text-xl font-bold">
            {latest ? t("uploadReport") : t("uploadReport")}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("fileLimit")}</p>
          {isPastDue && latest?.status === "resubmission_allowed" && (
            <p className="mb-4 rounded-lg bg-accent/40 p-3 text-sm">
              Your Engineer has allowed a resubmission after the deadline.
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <Button onClick={submit} disabled={!file || busy}>
              <Upload className="h-4 w-4" /> {busy ? "Uploading…" : t("uploadReport")}
            </Button>
          </div>
          {latest && (
            <p className="mt-3 text-sm text-muted-foreground">
              New upload will be attempt {latest.attempt_no + 1}.
            </p>
          )}
        </section>
      ) : (
        <p className="mb-8 rounded-xl border bg-muted p-4 text-sm text-muted-foreground">
          The due date has passed. Contact your Engineer if you need permission to resubmit.
        </p>
      )}

      <section className="mb-10">
        <h2 className="mb-4 text-xl font-bold">{t("attemptHistory")}</h2>
        {mySubmissions.length === 0 ? (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            {t("notSubmitted")}
          </p>
        ) : (
          <div className="space-y-3">
            {[...mySubmissions]
              .sort((a, b) => b.attempt_no - a.attempt_no)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"
                >
                  <FileText className="h-5 w-5 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {t("attempt")} {item.attempt_no}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.submitted_at
                        ? format(new Date(item.submitted_at), "d MMM yyyy, HH:mm")
                        : ""}
                    </p>
                  </div>
                  <Badge variant="outline">{submissionStatusLabel(item.status)}</Badge>
                  <Button size="sm" variant="outline" onClick={() => downloadSubmission(item)}>
                    <Download className="h-4 w-4" /> {t("preview")}
                  </Button>
                </div>
              ))}
          </div>
        )}
      </section>

      {publishedSummaries.length > 0 && (
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">{t("feedback")}</h2>
          {mySubmissions
            .filter((item) =>
              publishedSummaries.some(
                (summary: { submission_id: string }) => summary.submission_id === item.id,
              ),
            )
            .sort((a, b) => a.attempt_no - b.attempt_no)
            .map((item) => {
              const summary = publishedSummaries.find(
                (row: { submission_id: string }) => row.submission_id === item.id,
              );
              const grades =
                feedback?.gradings.filter(
                  (row: { submission_id: string }) => row.submission_id === item.id,
                ) ?? [];
              return (
                <FeedbackForm
                  key={item.id}
                  assignment={assignment}
                  attempt={item}
                  summary={summary}
                  grades={grades}
                  studentName={me.name}
                  groupName={me.groupName}
                  locale={locale}
                />
              );
            })}
        </section>
      )}
    </div>
  );
}

function cairoLocalDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function FeedbackForm({
  assignment,
  attempt,
  summary,
  grades,
  studentName,
  groupName,
  locale,
}: {
  assignment: PortalAssignment;
  attempt: PortalSubmission;
  summary: {
    general_comments: string | null;
    assessor_name: string | null;
    published_at: string | null;
  };
  grades: Array<{ criterion_id: string; achieved: boolean; comment: string | null }>;
  studentName: string;
  groupName: string | null;
  locale: "en" | "ar";
}) {
  const { t } = useLocale();
  const gradesByCriterion = new Map(grades.map((grade) => [grade.criterion_id, grade]));
  return (
    <article className="overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="border-b bg-muted/40 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Elsewedy Technical Academy
            </p>
            <h3 className="mt-1 text-lg font-bold">Assessment Feedback Form</h3>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              try {
                printFeedbackAsPdf({
                  locale,
                  assignmentTitle: assignment.title,
                  studentName,
                  className: groupName,
                  attemptNo: attempt.attempt_no,
                  assessorName: summary.assessor_name,
                  publishedAt: summary.published_at,
                  generalComments: summary.general_comments,
                  criteria: assignment.criteria.map((criterion) => {
                    const grade = gradesByCriterion.get(criterion.id);
                    return {
                      code: criterion.code,
                      description: criterion.description,
                      achieved: grade?.achieved ?? null,
                      comment: grade?.comment ?? null,
                    };
                  }),
                });
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not export feedback.");
              }
            }}
          >
            <Printer className="h-4 w-4" /> {t("exportPdf")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {assignment.title} · {t("attempt")} {attempt.attempt_no}
        </p>
        <p className="mt-1 text-sm">
          Student: {studentName} · {t("class")}: {groupName ?? t("unassigned")}
        </p>
        {summary.assessor_name && (
          <p className="mt-1 text-xs text-muted-foreground">Assessor: {summary.assessor_name}</p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted text-left">
              <th className="border p-3">{t("criteria")}</th>
              <th className="border p-3">Description</th>
              <th className="border p-3">{t("achieved")} (Yes/No)</th>
              <th className="border p-3">{t("comments")}</th>
            </tr>
          </thead>
          <tbody>
            {assignment.criteria.map((criterion) => {
              const grade = gradesByCriterion.get(criterion.id);
              return (
                <tr key={criterion.id}>
                  <td dir="ltr" className="border p-3 font-mono font-semibold">
                    {criterion.code}
                  </td>
                  <td className="border p-3">{criterion.description}</td>
                  <td className="border p-3">{grade ? (grade.achieved ? "Yes" : "No") : "—"}</td>
                  <td className="border p-3">{grade?.comment || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="p-5">
        <h4 className="font-semibold">{t("generalComments")}</h4>
        <p className="mt-2 min-h-16 whitespace-pre-wrap text-sm">
          {summary.general_comments || "—"}
        </p>
        {summary.published_at && (
          <p className="mt-4 text-xs text-muted-foreground">
            Published {format(new Date(summary.published_at), "d MMMM yyyy")}
          </p>
        )}
      </div>
    </article>
  );
}
