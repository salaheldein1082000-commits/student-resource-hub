import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/AppShell";
import { meQuery } from "@/lib/auth";
import { portalAssignmentsQuery, portalDb, type PortalAssignment } from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/manage/ai-assessment")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me?.role !== "unit_leader") throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "AI Assessment — Unit 1 IT Infrastructure" }] }),
  component: AiAssessmentSettings,
});

type RubricDraft = { criterion_id: string; max_points: string; guidance: string; model_answer: string };

type ConfigData = {
  enabled: boolean;
  model_answer: string;
  marking_guidance: string;
  rubric: Array<{ criterion_id: string; max_points: number; guidance: string; model_answer: string }>;
};

function AiAssessmentSettings() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [modelAnswer, setModelAnswer] = useState("");
  const [markingGuidance, setMarkingGuidance] = useState("");
  const [assignmentEnabled, setAssignmentEnabled] = useState(true);
  const [rubric, setRubric] = useState<RubricDraft[]>([]);
  const settingsQuery = useQuery({
    queryKey: ["portal", "settings"],
    queryFn: async () => {
      const { data, error } = await portalDb.from("portal_settings").select("ai_assessment_enabled, updated_at").eq("id", true).maybeSingle();
      if (error) throw error;
      return data as { ai_assessment_enabled: boolean; updated_at: string } | null;
    },
  });
  const assignmentsQuery = useQuery(portalAssignmentsQuery);
  const assignments = assignmentsQuery.data ?? [];
  const selected = assignments.find((item) => item.id === selectedAssignmentId) ?? null;
  const configQuery = useQuery({
    queryKey: ["portal", "ai-config", selectedAssignmentId],
    enabled: Boolean(selectedAssignmentId),
    queryFn: async (): Promise<ConfigData | null> => {
      const [configResult, rubricResult] = await Promise.all([
        portalDb.from("ai_assignment_configs").select("enabled, model_answer, marking_guidance").eq("assignment_id", selectedAssignmentId).maybeSingle(),
        portalDb.from("ai_rubric_items").select("criterion_id, max_points, guidance, model_answer").eq("assignment_id", selectedAssignmentId).order("sort_order"),
      ]);
      if (configResult.error) throw configResult.error;
      if (rubricResult.error) throw rubricResult.error;
      return configResult.data ? { ...configResult.data, rubric: rubricResult.data ?? [] } : null;
    },
  });
  const globalEnabled = settingsQuery.data?.ai_assessment_enabled ?? false;

  useEffect(() => {
    if (!selected) return;
    const config = configQuery.data;
    setModelAnswer(config?.model_answer ?? "");
    setMarkingGuidance(config?.marking_guidance ?? "");
    setAssignmentEnabled(config?.enabled ?? true);
    setRubric(selected.criteria.map((criterion) => {
      const saved = config?.rubric.find((item) => item.criterion_id === criterion.id);
      return { criterion_id: criterion.id, max_points: String(saved?.max_points ?? 1), guidance: saved?.guidance ?? "", model_answer: saved?.model_answer ?? "" };
    }));
  }, [selected, configQuery.data]);

  async function changeGlobalEnabled(next: boolean) {
    setSaving(true);
    try {
      const { error } = await portalDb.from("portal_settings").update({ ai_assessment_enabled: next, updated_at: new Date().toISOString() }).eq("id", true);
      if (error) throw error;
      toast.success(next ? "AI assessment is enabled." : "AI assessment is disabled.");
      await queryClient.invalidateQueries({ queryKey: ["portal", "settings"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the AI setting.");
    } finally { setSaving(false); }
  }

  async function saveAssignmentConfig() {
    if (!selected) return;
    const invalid = rubric.some((item) => !Number.isInteger(Number(item.max_points)) || Number(item.max_points) < 1);
    if (invalid) { toast.error("Each criterion must have at least 1 maximum point."); return; }
    setSaving(true);
    try {
      const { error: configError } = await portalDb.from("ai_assignment_configs").upsert({ assignment_id: selected.id, enabled: assignmentEnabled, model_answer: modelAnswer.trim(), marking_guidance: markingGuidance.trim(), updated_at: new Date().toISOString() }, { onConflict: "assignment_id" });
      if (configError) throw configError;
      const { error: deleteError } = await portalDb.from("ai_rubric_items").delete().eq("assignment_id", selected.id);
      if (deleteError) throw deleteError;
      const { error: rubricError } = await portalDb.from("ai_rubric_items").insert(rubric.map((item, index) => ({ assignment_id: selected.id, criterion_id: item.criterion_id, max_points: Number(item.max_points), guidance: item.guidance.trim(), model_answer: item.model_answer.trim(), sort_order: index })));
      if (rubricError) throw rubricError;
      toast.success("Gemini rubric saved.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["portal", "ai-config", selected.id] }),
        queryClient.invalidateQueries({ queryKey: ["portal", "ai-assessment-enabled", selected.id] }),
      ]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the AI rubric."); }
    finally { setSaving(false); }
  }

  function updateRubric(criterionId: string, patch: Partial<RubricDraft>) {
    setRubric((current) => current.map((item) => item.criterion_id === criterionId ? { ...item, ...patch } : item));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="AI assessment" sub="Configure Google Gemini draft marking. An assessor must approve every result." />
      <section className="rounded-xl border bg-card p-6 shadow-card">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-primary/10 p-3 text-primary"><Bot className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Global control</h2>
            <p className="mt-1 text-sm text-muted-foreground">Gemini reviews the private submission against your rubric and returns suggested points, evidence, confidence, and feedback. It never publishes a final grade.</p>
            <div className="mt-5 flex items-center justify-between rounded-lg border p-4">
              <div><p className="font-medium">Allow AI assessment</p><p className="text-sm text-muted-foreground">{globalEnabled ? "Enabled for configured assignments." : "Disabled. No AI review may run."}</p></div>
              <Switch checked={globalEnabled} disabled={settingsQuery.isLoading || saving} onCheckedChange={(value) => void changeGlobalEnabled(value)} aria-label="Allow AI assessment" />
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-3 rounded-lg bg-muted p-4 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p>Keep this disabled until you have tested the rubric on real examples. AI output is a draft and must be checked by a qualified assessor.</p></div>
      </section>

      <section className="rounded-xl border bg-card p-6 shadow-card">
        <h2 className="text-lg font-semibold">Assignment rubric and model answer</h2>
        <p className="mt-1 text-sm text-muted-foreground">Set the marking reference Gemini should use for each assignment.</p>
        <div className="mt-5 space-y-2"><Label htmlFor="ai-assignment">Assignment</Label><select id="ai-assignment" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedAssignmentId} onChange={(event) => setSelectedAssignmentId(event.target.value)}><option value="">Choose an assignment…</option>{assignments.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
        {selected && <div className="mt-5 space-y-5">
          <label className="flex items-center justify-between rounded-lg border p-4 text-sm"><span><span className="font-medium">Enable Gemini for this assignment</span><span className="block text-muted-foreground">The global switch must also be enabled.</span></span><Switch checked={assignmentEnabled} onCheckedChange={setAssignmentEnabled} /></label>
          <div className="space-y-2"><Label htmlFor="ai-model-answer">Overall model answer</Label><Textarea id="ai-model-answer" rows={6} value={modelAnswer} onChange={(event) => setModelAnswer(event.target.value)} placeholder="Write the answer or standard you expect students to demonstrate…" /></div>
          <div className="space-y-2"><Label htmlFor="ai-guidance">Overall marking guidance</Label><Textarea id="ai-guidance" rows={4} value={markingGuidance} onChange={(event) => setMarkingGuidance(event.target.value)} placeholder="Explain how to award marks and what must not be accepted…" /></div>
          <div className="space-y-4"><h3 className="font-semibold">Criteria</h3>{selected.criteria.map((criterion) => { const item = rubric.find((row) => row.criterion_id === criterion.id); if (!item) return null; return <article key={criterion.id} className="space-y-3 rounded-lg border p-4"><div><p className="font-mono font-bold">{criterion.code}</p><p className="text-sm text-muted-foreground">{criterion.description}</p></div><div className="grid gap-3 sm:grid-cols-[140px_1fr]"><div className="space-y-2"><Label htmlFor={`points-${criterion.id}`}>Maximum points</Label><Input id={`points-${criterion.id}`} type="number" min="1" max="100" value={item.max_points} onChange={(event) => updateRubric(criterion.id, { max_points: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`guidance-${criterion.id}`}>Criterion guidance</Label><Textarea id={`guidance-${criterion.id}`} rows={2} value={item.guidance} onChange={(event) => updateRubric(criterion.id, { guidance: event.target.value })} placeholder="What evidence earns these points?" /></div></div><div className="space-y-2"><Label htmlFor={`answer-${criterion.id}`}>Criterion model answer</Label><Textarea id={`answer-${criterion.id}`} rows={3} value={item.model_answer} onChange={(event) => updateRubric(criterion.id, { model_answer: event.target.value })} /></div></article>; })}</div>
          <Button onClick={() => void saveAssignmentConfig()} disabled={saving || configQuery.isLoading}><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Gemini rubric"}</Button>
        </div>}
      </section>
    </div>
  );
}
