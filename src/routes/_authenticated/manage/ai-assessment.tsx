import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Bot, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/AppShell";
import { meQuery } from "@/lib/auth";
import { portalDb } from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/manage/ai-assessment")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me?.role !== "unit_leader") throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "AI Assessment — Unit 1 IT Infrastructure" }] }),
  component: AiAssessmentSettings,
});

function AiAssessmentSettings() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const settingsQuery = useQuery({
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
  const enabled = settingsQuery.data?.ai_assessment_enabled ?? false;

  async function changeEnabled(next: boolean) {
    setSaving(true);
    try {
      const { error } = await portalDb
        .from("portal_settings")
        .update({ ai_assessment_enabled: next, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) throw error;
      toast.success(next ? "AI assessment is enabled." : "AI assessment is disabled.");
      await queryClient.invalidateQueries({ queryKey: ["portal", "settings"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the AI setting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="AI assessment"
        sub="Control whether the portal may run AI-assisted draft assessments."
      />
      <section className="rounded-xl border bg-card p-6 shadow-card">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-primary/10 p-3 text-primary">
            <Bot className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">AI draft marking</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              When enabled, configured assignments can be sent for a draft AI review. AI results will
              never be published directly to students; an assessor must review and approve them.
            </p>
            <div className="mt-5 flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">Allow AI assessment</p>
                <p className="text-sm text-muted-foreground">
                  {settingsQuery.isLoading
                    ? "Loading setting…"
                    : enabled
                      ? "Enabled for future AI assessment jobs."
                      : "Disabled. No AI assessment jobs may run."}
                </p>
              </div>
              <Switch
                checked={enabled}
                disabled={settingsQuery.isLoading || saving}
                onCheckedChange={(value) => void changeEnabled(value)}
                aria-label="Allow AI assessment"
              />
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-3 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p>
            Turning this off is immediate and reversible. Existing draft results are not published or
            deleted; new AI jobs will remain disabled until you turn the feature back on.
          </p>
        </div>
        {settingsQuery.error && (
          <p className="mt-4 text-sm text-destructive">{settingsQuery.error.message}</p>
        )}
        <Button className="mt-5" variant="outline" onClick={() => void settingsQuery.refetch()} disabled={saving}>
          Refresh setting
        </Button>
      </section>
    </div>
  );
}
