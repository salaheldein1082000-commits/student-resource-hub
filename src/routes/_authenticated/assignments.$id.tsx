import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/AppShell";
import { AttemptHistory, FeedbackView } from "@/components/feedback";
import { useMe } from "@/lib/auth";
import { assignmentsQuery, latestAttempt, submissionsQuery } from "@/lib/data";
import { validateSubmissionFile } from "@/lib/submission";

export const Route = createFileRoute("/_authenticated/assignments/$id")({
  head: () => ({
    meta: [
      { title: "Assignment — Unit 1 Studio" },
      {
        name: "description",
        content: "Submit your work and read criterion-by-criterion feedback.",
      },
      { property: "og:title", content: "Assignment — Unit 1 Studio" },
      { property: "og:description", content: "Submit work and read feedback." },
    ],
  }),
  component: AssignmentPage,
});

const DECLARATION =
  "I confirm that this work is my own. Where I have used sources or help, I have clearly referenced them. I understand that submitting someone else's work is malpractice.";

function AssignmentPage() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { data: assignments = [] } = useQuery(assignmentsQuery);
  const { data: subs = [] } = useQuery(submissionsQuery);
  const a = assignments.find((x) => x.id === id);
  const sub = subs.find((s) => s.assignment_id === id && s.student_id === me?.id);
  const last = sub && latestAttempt(sub);
  const canSubmit = !sub || sub.status === "resubmission";

  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!a || !me) return <p className="text-muted-foreground">Loading…</p>;

  async function submit() {
    const fileError = validateSubmissionFile(file);
    if (fileError) {
      toast.error(fileError);
      return;
    }
    if (!declared || !me || !file) return;
    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      const path = `${me.id}/${id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const up = await supabase.storage.from("submissions").upload(path, file);
      if (up.error) throw up.error;
      uploadedPath = path;
      let subId = sub?.id;
      if (!subId) {
        const ins = await supabase
          .from("submissions")
          .insert({ assignment_id: id, student_id: me.id })
          .select("id")
          .single();
        if (ins.error) throw ins.error;
        subId = ins.data.id;
      } else {
        const u = await supabase
          .from("submissions")
          .update({ status: "submitted" })
          .eq("id", subId);
        if (u.error) throw u.error;
      }
      const att = await supabase.from("attempts").insert({
        submission_id: subId,
        attempt_no: (sub?.attempts.length ?? 0) + 1,
        file_path: path,
        file_name: file.name,
        note: note || null,
        declaration_accepted: true,
        declared_at: new Date().toISOString(),
      });
      if (att.error) throw att.error;
      toast.success("Submitted. Your declaration has been recorded.");
      setFile(null);
      setNote("");
      setDeclared(false);
      qc.invalidateQueries({ queryKey: ["submissions"] });
    } catch (e) {
      if (uploadedPath) {
        await supabase.storage.from("submissions").remove([uploadedPath]);
      }
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={a.title}
        sub={a.due_date ? `Due ${format(new Date(a.due_date), "EEEE d MMMM yyyy")}` : undefined}
      />
      {a.brief && (
        <p className="mb-8 whitespace-pre-wrap rounded-xl border bg-card p-5 shadow-card">
          {a.brief}
        </p>
      )}

      {last?.assessed_at && (
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-bold">Feedback on attempt {last.attempt_no}</h2>
          <FeedbackView attempt={last} codes={a.criteria_codes} />
        </section>
      )}

      {canSubmit && (
        <section className="mb-10 rounded-xl border bg-card p-6 shadow-card">
          <h2 className="mb-4 text-xl font-bold">
            {sub ? "Upload a new attempt" : "Submit your work"}
          </h2>
          <div className="space-y-4">
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Textarea
              placeholder="Note to your assessor (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <label className="flex items-start gap-3 rounded-lg bg-muted p-4 text-sm">
              <Checkbox
                checked={declared}
                onCheckedChange={(v) => setDeclared(v === true)}
                className="mt-0.5"
              />
              <span>
                <strong>Authentication declaration.</strong> {DECLARATION}
              </span>
            </label>
            <Button onClick={submit} disabled={!file || !declared || busy}>
              <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Submit"}
            </Button>
          </div>
        </section>
      )}

      {sub && sub.attempts.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Attempt history</h2>
          <AttemptHistory attempts={sub.attempts} />
        </section>
      )}
    </div>
  );
}
