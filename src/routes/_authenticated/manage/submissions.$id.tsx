import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/AppShell";
import { AttemptHistory } from "@/components/feedback";
import { useMe } from "@/lib/auth";
import { assignmentsQuery, criteriaQuery, latestAttempt, submissionsQuery } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/manage/submissions/$id")({
  head: () => ({
    meta: [
      { title: "Mark submission — Unit 1 Studio" },
      { name: "description", content: "Assess a submission criterion by criterion." },
      { property: "og:title", content: "Mark submission — Unit 1 Studio" },
      { property: "og:description", content: "Assessor marking." },
    ],
  }),
  component: Grade,
});

type Row = { achieved: boolean; comment: string };

function Grade() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: subs = [] } = useQuery(submissionsQuery);
  const { data: assignments = [] } = useQuery(assignmentsQuery);
  const { data: criteria = [] } = useQuery(criteriaQuery);
  const { data: snippets = [] } = useQuery({
    queryKey: ["snippets"],
    queryFn: async () => (await supabase.from("feedback_snippets").select("*").order("created_at")).data ?? [],
  });
  const sub = subs.find((s) => s.id === id);
  const a = assignments.find((x) => x.id === sub?.assignment_id);
  const att = sub ? latestAttempt(sub) : undefined;
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [feedback, setFeedback] = useState("");
  const [resub, setResub] = useState(false);

  useEffect(() => {
    if (!att) return;
    const r: Record<string, Row> = {};
    for (const x of att.criterion_results) r[x.criterion_code] = { achieved: x.achieved, comment: x.comment ?? "" };
    setRows(r);
    setFeedback(att.feedback ?? "");
  }, [att?.id]);

  if (!sub || !a || !att) return <p className="text-muted-foreground">Loading…</p>;
  const codes = criteria.filter((c) => a.criteria_codes.includes(c.code));

  async function save() {
    if (!att || !sub) return;
    const results = codes.map((c) => ({
      attempt_id: att.id, criterion_code: c.code,
      achieved: rows[c.code]?.achieved ?? false, comment: rows[c.code]?.comment || null,
    }));
    const r1 = await supabase.from("criterion_results").upsert(results);
    const r2 = await supabase.from("attempts").update({ feedback: feedback || null, assessed_at: new Date().toISOString(), assessed_by: me?.id ?? null }).eq("id", att.id);
    const r3 = await supabase.from("submissions").update({ status: resub ? "resubmission" : "assessed" }).eq("id", sub.id);
    const err = r1.error ?? r2.error ?? r3.error;
    if (err) { toast.error(err.message); return; }
    toast.success("Feedback saved");
    await qc.invalidateQueries({ queryKey: ["submissions"] });
    navigate({ to: "/dashboard" });
  }

  const set = (code: string, p: Partial<Row>) =>
    setRows((r) => ({ ...r, [code]: { achieved: false, comment: "", ...r[code], ...p } }));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={sub.profiles?.full_name ?? "Submission"} sub={`${a.title} · attempt ${att.attempt_no}`} />
      {att.note && <p className="mb-6 rounded-lg bg-muted p-4 text-sm">Student note: {att.note}</p>}
      <h2 className="mb-3 text-lg font-bold">Attempts</h2>
      <AttemptHistory attempts={sub.attempts} />
      <h2 className="mb-3 mt-8 text-lg font-bold">Criteria</h2>
      <div className="space-y-3">
        {codes.map((c) => (
          <div key={c.code} className="rounded-xl border bg-card p-4 shadow-card">
            <label className="flex items-start gap-3">
              <Checkbox checked={rows[c.code]?.achieved ?? false} onCheckedChange={(v) => set(c.code, { achieved: v === true })} className="mt-1" />
              <span><strong className="font-mono">{c.code}</strong> — {c.description}</span>
            </label>
            <Input className="mt-3" placeholder="Comment" value={rows[c.code]?.comment ?? ""} onChange={(e) => set(c.code, { comment: e.target.value })} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {snippets.filter((s) => s.criterion_code === c.code).map((s) => (
                <button key={s.id} type="button" onClick={() => set(c.code, { comment: [rows[c.code]?.comment, s.body].filter(Boolean).join(" ") })}
                  className="rounded-md border bg-muted px-2 py-1 text-xs hover:border-primary">+ {s.body.slice(0, 50)}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Textarea className="mt-6" rows={5} placeholder="Overall feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      <label className="mt-4 flex items-center gap-2 text-sm">
        <Checkbox checked={resub} onCheckedChange={(v) => setResub(v === true)} /> Allow a resubmission
      </label>
      <Button className="mt-6" onClick={save}>Save feedback</Button>
    </div>
  );
}
