import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bot, Download, FileText, Printer, Save, Send, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/AppShell";
import { useMe } from "@/lib/auth";
import { useLocale } from "@/lib/locale";
import { printFeedbackAsPdf } from "@/lib/feedbackPdf";
import { supabase } from "@/integrations/supabase/client";
import { getDriveSubmissionFile, openDriveSubmissionFile } from "@/lib/drive";
import {
  portalAssignmentByIdQuery,
  portalDb,
  openSubmissionFile,
  portalSubmissionByIdQuery,
  signedStorageUrl,
  type PortalCriterion,
} from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/manage/submissions/$id")({
  head: () => ({
    meta: [
      { title: "Assess submission — Unit 1 IT Infrastructure" },
      { name: "description", content: "Review, grade and publish criterion-based feedback." },
    ],
  }),
  component: GradeSubmission,
});

type GradeRow = { achieved: boolean | null; comment: string };

type Preview = { kind: "pdf"; url: string } | { kind: "docx"; text: string };
type AiCriterionResult = { criterion_code: string; suggested_points: number; evidence: string; reasoning: string; feedback: string; confidence: "low" | "medium" | "high" };
type AiResult = { total_points: number; overall_summary: string; criteria: AiCriterionResult[] };

function GradeSubmission() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const queryClient = useQueryClient();
  const submissionQuery = useQuery(portalSubmissionByIdQuery(id));
  const submission = submissionQuery.data;
  const assignmentQuery = useQuery(portalAssignmentByIdQuery(submission?.assignment_id ?? null));
  const assignment = assignmentQuery.data;
  const [rows, setRows] = useState<Record<string, GradeRow>>({});
  const [generalComments, setGeneralComments] = useState("");
  const [busy, setBusy] = useState(false);

  const assessmentQuery = useQuery({
    queryKey: ["portal", "assessment", id],
    enabled: !!submission,
    queryFn: async () => {
      const [grades, summary] = await Promise.all([
        portalDb.from("gradings").select("*").eq("submission_id", id),
        portalDb.from("feedback_summary").select("*").eq("submission_id", id).maybeSingle(),
      ]);
      if (grades.error) throw grades.error;
      if (summary.error) throw summary.error;
      return { grades: grades.data ?? [], summary: summary.data };
    },
  });
  const aiSettingsQuery = useQuery({
    queryKey: ["portal", "settings"],
    queryFn: async () => {
      const { data, error } = await portalDb
        .from("portal_settings")
        .select("ai_assessment_enabled, updated_at")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data as { ai_assessment_enabled: boolean; updated_at: string } | null;
    },
  });
  const aiAssignmentEnabledQuery = useQuery({
    queryKey: ["portal", "ai-assessment-enabled", submission?.assignment_id],
    enabled: !!submission?.assignment_id,
    queryFn: async () => {
      const { data, error } = await portalDb
        .from("ai_assignment_configs")
        .select("enabled")
        .eq("assignment_id", submission!.assignment_id)
        .maybeSingle();
      if (error) throw error;
      return data?.enabled === true;
    },
  });
  const canUseAiReview =
    !aiSettingsQuery.isFetching &&
    !aiAssignmentEnabledQuery.isFetching &&
    !aiSettingsQuery.error &&
    !aiAssignmentEnabledQuery.error &&
    aiSettingsQuery.data?.ai_assessment_enabled === true &&
    aiAssignmentEnabledQuery.data === true;
  const aiRunQuery = useQuery({
    queryKey: ["portal", "ai-assessment", id],
    enabled: !!submission && canUseAiReview,
    queryFn: async () => {
      const { data, error } = await portalDb.from("ai_assessment_runs").select("id, status, result, error_message, model, created_at, completed_at").eq("submission_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as { id: string; status: string; result: AiResult | null; error_message: string | null; model: string; created_at: string; completed_at: string | null } | null;
    },
  });

  useEffect(() => {
    if (!assignment || !assessmentQuery.data) return;
    const initial: Record<string, GradeRow> = {};
    for (const criterion of assignment.criteria) {
      const saved = assessmentQuery.data.grades.find(
        (grade: { criterion_id: string }) => grade.criterion_id === criterion.id,
      );
      initial[criterion.id] = { achieved: saved?.achieved ?? null, comment: saved?.comment ?? "" };
    }
    setRows(initial);
    setGeneralComments(assessmentQuery.data.summary?.general_comments ?? "");
  }, [assignment, assessmentQuery.data]);

  const previewQuery = useQuery({
    queryKey: ["portal", "submission-preview", id, submission?.file_url],
    enabled: !!submission?.file_url,
    gcTime: 0,
    queryFn: async (): Promise<Preview> => {
      if (submission!.storage_provider === "google_drive") {
        const file = await getDriveSubmissionFile(submission!.id);
        if (file.mimeType === "application/pdf") {
          return { kind: "pdf", url: URL.createObjectURL(file.blob) };
        }
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ arrayBuffer: await file.blob.arrayBuffer() });
        return { kind: "docx", text: result.value };
      }
      const url = await signedStorageUrl("submissions", submission!.file_url);
      if (submission!.file_url.toLowerCase().endsWith(".pdf")) return { kind: "pdf", url };
      const response = await fetch(url);
      if (!response.ok) throw new Error("Could not download the private DOCX preview.");
      const arrayBuffer = await response.arrayBuffer();
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer });
      return { kind: "docx", text: result.value };
    },
  });

  useEffect(() => {
    const preview = previewQuery.data;
    if (preview?.kind !== "pdf" || !preview.url.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [previewQuery.data]);

  const criteria = useMemo(
    () =>
      [...(assignment?.criteria ?? [])].sort(
        (a, b) => (a.task_no ?? 0) - (b.task_no ?? 0) || a.sort_order - b.sort_order,
      ),
    [assignment?.criteria],
  );
  const criterionByCode = new Map(criteria.map((criterion) => [criterion.code, criterion]));
  const achievedByCode = (code: string) => {
    const criterion = criterionByCode.get(code);
    return criterion ? rows[criterion.id]?.achieved : null;
  };
  const passCriteriaReady = ["A.P1", "A.P2", "A.P3"].every((code) => achievedByCode(code) === true);
  const meritReady = achievedByCode("A.M1") === true;
  const allAnswered =
    criteria.length > 0 &&
    criteria.every(
      (criterion) =>
        rows[criterion.id]?.achieved !== null && rows[criterion.id]?.achieved !== undefined,
    );

  if (submissionQuery.isLoading || (submission && assignmentQuery.isLoading))
    return <p className="text-muted-foreground">{t("loading")}</p>;
  if (submissionQuery.error || assignmentQuery.error) {
    return (
      <p className="rounded-xl border bg-card p-6 text-destructive" role="alert">
        {submissionQuery.error?.message ?? assignmentQuery.error?.message}
      </p>
    );
  }
  if (!submission || !assignment || !me || me.role === "student") {
    return (
      <p className="rounded-xl border bg-card p-6 text-muted-foreground">
        Submission not found or outside your assigned classes.
      </p>
    );
  }
  const currentSubmission = submission;
  const currentAssignment = assignment;
  const currentMe = me;

  function updateAchieved(criterion: PortalCriterion, achieved: boolean) {
    setRows((previous) => {
      const current = previous[criterion.id] ?? { achieved: null, comment: "" };
      const next: Record<string, GradeRow> = {
        ...previous,
        [criterion.id]: { ...current, achieved },
      };
      if (achieved === false && ["A.P1", "A.P2", "A.P3"].includes(criterion.code)) {
        for (const code of ["A.M1", "A.D1"]) {
          const dependent = criterionByCode.get(code);
          if (dependent)
            next[dependent.id] = {
              ...(next[dependent.id] ?? { achieved: null, comment: "" }),
              achieved: false,
            };
        }
      }
      if (criterion.code === "A.M1" && achieved === false) {
        const distinction = criterionByCode.get("A.D1");
        if (distinction)
          next[distinction.id] = {
            ...(next[distinction.id] ?? { achieved: null, comment: "" }),
            achieved: false,
          };
      }
      return next;
    });
  }

  async function upsertGrade(
    criterion: PortalCriterion,
    achieved: boolean,
    comment: string,
    assessedAt: string | null,
  ) {
    const { error } = await portalDb.from("gradings").upsert(
      {
        submission_id: currentSubmission.id,
        criterion_id: criterion.id,
        achieved,
        comment: comment || null,
        assessed_at: assessedAt,
      },
      { onConflict: "submission_id,criterion_id" },
    );
    if (error) throw error;
  }

  async function persistGrades(assessedAt: string | null) {
    const values = new Map(
      criteria.map((criterion) => [criterion.code, rows[criterion.id]?.achieved ?? null]),
    );
    const existing = assessmentQuery.data?.grades ?? [];
    const oldByCode = new Map<string, boolean>();
    for (const grade of existing) {
      const criterion = criteria.find((item) => item.id === grade.criterion_id);
      if (criterion) oldByCode.set(criterion.code, grade.achieved);
    }
    const d1 = criterionByCode.get("A.D1");
    const m1 = criterionByCode.get("A.M1");

    // Clear dependent achievements first so the database trigger never sees an invalid intermediate state.
    if (d1 && oldByCode.get("A.D1") === true && values.get("A.D1") !== true) {
      await upsertGrade(d1, false, rows[d1.id]?.comment ?? "", assessedAt);
    }
    if (m1 && oldByCode.get("A.M1") === true && values.get("A.M1") !== true) {
      await upsertGrade(m1, false, rows[m1.id]?.comment ?? "", assessedAt);
    }
    for (const code of ["A.P1", "A.P2", "A.P3"]) {
      const criterion = criterionByCode.get(code);
      if (criterion && values.get(code) !== null) {
        await upsertGrade(
          criterion,
          values.get(code) === true,
          rows[criterion.id]?.comment ?? "",
          assessedAt,
        );
      }
    }
    if (
      m1 &&
      values.get("A.M1") !== null &&
      !(oldByCode.get("A.M1") === true && values.get("A.M1") !== true)
    ) {
      await upsertGrade(m1, values.get("A.M1") === true, rows[m1.id]?.comment ?? "", assessedAt);
    }
    if (
      d1 &&
      values.get("A.D1") !== null &&
      !(oldByCode.get("A.D1") === true && values.get("A.D1") !== true)
    ) {
      await upsertGrade(d1, values.get("A.D1") === true, rows[d1.id]?.comment ?? "", assessedAt);
    }
    for (const criterion of criteria.filter(
      (item) => !["A.P1", "A.P2", "A.P3", "A.M1", "A.D1"].includes(item.code),
    )) {
      const achieved = rows[criterion.id]?.achieved;
      if (achieved !== null && achieved !== undefined) {
        await upsertGrade(criterion, achieved, rows[criterion.id]?.comment ?? "", assessedAt);
      }
    }
  }

  async function saveDraft() {
    setBusy(true);
    try {
      const { error: unpublishError } = await portalDb.from("feedback_summary").upsert(
        {
          submission_id: currentSubmission.id,
          general_comments: generalComments || null,
          assessor_name: currentMe.name,
          published: false,
          published_at: null,
        },
        { onConflict: "submission_id" },
      );
      if (unpublishError) throw unpublishError;
      await persistGrades(null);
      toast.success("Draft saved. Students cannot see unpublished feedback.");
      await queryClient.invalidateQueries({ queryKey: ["portal", "assessment", id] });
      await queryClient.invalidateQueries({ queryKey: ["portal", "published-feedback"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the draft.");
    } finally {
      setBusy(false);
    }
  }

  async function publishFeedback() {
    if (!allAnswered) {
      toast.error("Choose Yes or No for every criterion before publishing.");
      return;
    }
    if (criterionByCode.has("A.M1") && achievedByCode("A.M1") === true && !passCriteriaReady) {
      toast.error("A.M1 can be Yes only when A.P1, A.P2 and A.P3 are all Yes.");
      return;
    }
    if (criterionByCode.has("A.D1") && achievedByCode("A.D1") === true && !meritReady) {
      toast.error("A.D1 can be Yes only when A.M1 is Yes.");
      return;
    }

    setBusy(true);
    try {
      const stamp = new Date().toISOString();
      const { error: hideError } = await portalDb.from("feedback_summary").upsert(
        {
          submission_id: currentSubmission.id,
          general_comments: generalComments || null,
          assessor_name: currentMe.name,
          published: false,
          published_at: null,
        },
        { onConflict: "submission_id" },
      );
      if (hideError) throw hideError;
      await persistGrades(stamp);
      const { error: publishError } = await portalDb.from("feedback_summary").upsert(
        {
          submission_id: currentSubmission.id,
          general_comments: generalComments || null,
          assessor_name: currentMe.name,
          published: true,
          published_at: stamp,
        },
        { onConflict: "submission_id" },
      );
      if (publishError) throw publishError;
      const { error: statusError } = await portalDb
        .from("submissions")
        .update({ status: "graded" })
        .eq("id", currentSubmission.id);
      if (statusError) throw statusError;
      toast.success("Feedback published to the student.");
      await queryClient.invalidateQueries({ queryKey: ["portal", "assessment", id] });
      await queryClient.invalidateQueries({ queryKey: ["portal", "submissions"] });
      await queryClient.invalidateQueries({ queryKey: ["portal", "submission", id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not publish feedback.");
    } finally {
      setBusy(false);
    }
  }

  async function allowResubmission() {
    if (!assessmentQuery.data?.summary?.published) {
      toast.error("Publish feedback before allowing a resubmission.");
      return;
    }
    setBusy(true);
    const { error } = await portalDb
      .from("submissions")
      .update({ status: "resubmission_allowed" })
      .eq("id", currentSubmission.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Resubmission allowed for this student.");
    await queryClient.invalidateQueries({ queryKey: ["portal", "assessment", id] });
    await queryClient.invalidateQueries({ queryKey: ["portal", "submissions"] });
    await queryClient.invalidateQueries({ queryKey: ["portal", "submission", id] });
  }

  async function downloadFile() {
    try {
      if (currentSubmission.storage_provider === "google_drive") {
        await openDriveSubmissionFile(currentSubmission.id, true);
      } else {
        await openSubmissionFile("submissions", currentSubmission.file_url);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the submission file.");
    }
  }

  async function deleteSubmission() {
    if (
      !window.confirm(
        "Delete this submission permanently? Its stored file, assessment feedback, and submission record will be removed. This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("drive-storage", {
        body: { action: "delete_submission", submissionId: currentSubmission.id },
      });
      if (error) throw error;
      if (!data?.deleted) throw new Error("The submission was not deleted.");
      toast.success("Submission and stored file deleted.");
      await queryClient.invalidateQueries({ queryKey: ["portal", "submissions"] });
      navigate({ to: "/manage/submissions" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the submission.");
    } finally {
      setBusy(false);
    }
  }

  async function runAiReview() {
    if (!canUseAiReview) {
      toast.error("Enable AI assessment globally and for this assignment before running a review.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("drive-storage", {
        body: { action: "ai_assess_submission", submissionId: currentSubmission.id },
      });
      if (error) throw error;
      if (!data?.result) throw new Error("Gemini did not return an assessment draft.");
      toast.success("Gemini draft assessment is ready for review.");
      await queryClient.invalidateQueries({ queryKey: ["portal", "ai-assessment", id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run Gemini assessment.");
    } finally {
      setBusy(false);
    }
  }

  function exportPublishedFeedback() {
    const summary = assessmentQuery.data?.summary;
    if (!summary?.published) return;
    try {
      const savedGrades = assessmentQuery.data?.grades ?? [];
      printFeedbackAsPdf({
        locale,
        assignmentTitle: currentAssignment.title,
        studentName:
          currentSubmission.profiles?.full_name ?? currentSubmission.profiles?.email ?? "Student",
        className: currentSubmission.profiles?.group_name ?? null,
        attemptNo: currentSubmission.attempt_no,
        assessorName: summary.assessor_name,
        publishedAt: summary.published_at,
        generalComments: summary.general_comments,
        criteria: criteria.map((criterion) => {
          const grade = savedGrades.find(
            (item: { criterion_id: string }) => item.criterion_id === criterion.id,
          );
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
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={submission.profiles?.full_name ?? submission.profiles?.email ?? "Student submission"}
        sub={`${assignment.title} · ${t("class")}: ${submission.profiles?.group_name ?? t("unassigned")} · ${t("attempt")} ${submission.attempt_no}`}
      >
        <Button variant="outline" onClick={downloadFile}>
          <Download className="h-4 w-4" /> Download
        </Button>
        {assessmentQuery.data?.summary?.published && (
          <Button variant="outline" onClick={exportPublishedFeedback}>
            <Printer className="h-4 w-4" /> {t("exportPdf")}
          </Button>
        )}
      </PageHeader>

      <section className="mb-8 rounded-xl border bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Submission preview</h2>
        </div>
        {previewQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Preparing the private file preview…</p>
        ) : previewQuery.error ? (
          <p className="text-sm text-destructive">{previewQuery.error.message}</p>
        ) : previewQuery.data?.kind === "pdf" ? (
          <iframe
            title="Student PDF submission"
            src={previewQuery.data.url}
            className="h-[70vh] w-full rounded-lg border"
          />
        ) : previewQuery.data?.kind === "docx" ? (
          <div className="max-h-[70vh] overflow-auto rounded-lg border bg-background p-5">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-7">
              {previewQuery.data.text || "This document contains no extractable text."}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Private preview unavailable.</p>
        )}
      </section>

      {canUseAiReview && (
      <section className="mb-8 rounded-xl border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /><h2 className="text-lg font-bold">Gemini draft assessment</h2></div>
            <p className="mt-1 text-sm text-muted-foreground">Gemini compares this private file with the Unit Leader rubric and returns suggested points and evidence. It will not publish a grade.</p>
          </div>
          <Button variant="outline" onClick={() => void runAiReview()} disabled={busy}><Bot className="h-4 w-4" /> {busy ? "Reviewing…" : "Run Gemini review"}</Button>
        </div>
        {aiRunQuery.data?.status === "failed" && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{aiRunQuery.data.error_message ?? "The Gemini review failed."}</p>}
        {aiRunQuery.data?.result && <div className="mt-5 space-y-3"><div className="rounded-lg bg-muted p-4"><p className="font-semibold">Suggested total: {aiRunQuery.data.result.total_points}</p><p className="mt-1 text-sm text-muted-foreground">{aiRunQuery.data.result.overall_summary}</p></div>{aiRunQuery.data.result.criteria.map((item) => <article key={item.criterion_code} className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono font-bold">{item.criterion_code}: {item.suggested_points} points</p><span className="text-xs uppercase text-muted-foreground">Confidence: {item.confidence}</span></div><p className="mt-2 text-sm"><strong>Evidence:</strong> {item.evidence}</p><p className="mt-2 text-sm text-muted-foreground"><strong>Reasoning:</strong> {item.reasoning}</p><p className="mt-2 text-sm"><strong>Suggested feedback:</strong> {item.feedback}</p></article>)}</div>}
      </section>
      )}

      <section>
        <h2 className="mb-3 text-xl font-bold">{t("criteria")}</h2>
        <div className="space-y-3">
          {criteria.map((criterion) => {
            const current = rows[criterion.id] ?? { achieved: null, comment: "" };
            const yesBlocked =
              (criterion.code === "A.M1" && !passCriteriaReady) ||
              (criterion.code === "A.D1" && !meritReady);
            return (
              <article key={criterion.id} className="rounded-xl border bg-card p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-mono font-bold">{criterion.code}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{criterion.description}</p>
                  </div>
                  <div
                    className="flex gap-2"
                    role="group"
                    aria-label={`Achieved for ${criterion.code}`}
                  >
                    <Button
                      size="sm"
                      variant={current.achieved === true ? "default" : "outline"}
                      disabled={yesBlocked}
                      onClick={() => updateAchieved(criterion, true)}
                    >
                      Yes
                    </Button>
                    <Button
                      size="sm"
                      variant={current.achieved === false ? "destructive" : "outline"}
                      onClick={() => updateAchieved(criterion, false)}
                    >
                      No
                    </Button>
                  </div>
                </div>
                {yesBlocked && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {criterion.code === "A.M1"
                      ? "A.P1–A.P3 must all be Yes first."
                      : "A.M1 must be Yes first."}
                  </p>
                )}
                <Input
                  className="mt-4"
                  aria-label={`Comment for ${criterion.code}`}
                  placeholder={`${t("comments")} · ${criterion.code}`}
                  value={current.comment}
                  onChange={(event) =>
                    setRows((previous) => ({
                      ...previous,
                      [criterion.id]: { ...current, comment: event.target.value },
                    }))
                  }
                />
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-8 rounded-xl border bg-card p-5 shadow-card">
        <label className="mb-2 block font-semibold" htmlFor="general-comments">
          {t("generalComments")}
        </label>
        <Textarea
          id="general-comments"
          rows={5}
          value={generalComments}
          onChange={(event) => setGeneralComments(event.target.value)}
        />
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="outline" onClick={saveDraft} disabled={busy || !assessmentQuery.data}>
          <Save className="h-4 w-4" /> {t("saveDraft")}
        </Button>
        <Button onClick={publishFeedback} disabled={busy || !assessmentQuery.data || !allAnswered}>
          <Send className="h-4 w-4" /> {t("publishFeedback")}
        </Button>
        <Button
          variant="secondary"
          onClick={allowResubmission}
          disabled={busy || submission.status !== "graded"}
        >
          <ShieldCheck className="h-4 w-4" /> {t("allowResubmission")}
        </Button>
        <Button variant="destructive" onClick={() => void deleteSubmission()} disabled={busy}>
          <Trash2 className="h-4 w-4" /> Delete submission
        </Button>
      </div>
      {submission.status === "resubmission_allowed" && (
        <p className="mt-3 text-sm text-muted-foreground">
          Resubmission has been enabled. A new student upload will appear as a separate attempt.
        </p>
      )}
    </div>
  );
}
