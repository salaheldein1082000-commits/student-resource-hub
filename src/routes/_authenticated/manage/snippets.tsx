import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/AppShell";
import { criteriaQuery } from "@/lib/data";

export const snippetsQuery = {
  queryKey: ["snippets"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("feedback_snippets")
      .select("*")
      .order("created_at");
    if (error) throw error;
    return data ?? [];
  },
};

export const Route = createFileRoute("/_authenticated/manage/snippets")({
  head: () => ({
    meta: [
      { title: "Feedback bank — BTEC Assessment Portal" },
      { name: "description", content: "Reusable feedback comments for each criterion." },
    ],
  }),
  component: Snippets,
});

function Snippets() {
  const qc = useQueryClient();
  const criteriaResult = useQuery(criteriaQuery);
  const snippetsResult = useQuery(snippetsQuery);
  const criteria = criteriaResult.data ?? [];
  const list = snippetsResult.data ?? [];
  const [code, setCode] = useState("A.P1");
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = async () => qc.invalidateQueries({ queryKey: ["snippets"] });

  function startEdit(item: (typeof list)[number]) {
    setEditingId(item.id);
    setCode(item.criterion_code ?? criteria[0]?.code ?? "");
    setBody(item.body);
  }

  function reset() {
    setEditingId(null);
    setBody("");
    setCode(criteria[0]?.code ?? "");
  }

  async function save() {
    if (!body.trim()) {
      toast.error("Enter feedback text.");
      return;
    }
    if (!code) {
      toast.error("Choose a criterion.");
      return;
    }
    setBusy(true);
    try {
      const result = editingId
        ? await supabase
            .from("feedback_snippets")
            .update({ criterion_code: code, body: body.trim() })
            .eq("id", editingId)
        : await supabase
            .from("feedback_snippets")
            .insert({ criterion_code: code, body: body.trim() });
      if (result.error) throw result.error;
      toast.success(editingId ? "Feedback snippet updated." : "Feedback snippet added.");
      reset();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save feedback snippet.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: (typeof list)[number]) {
    if (!window.confirm("Permanently delete this feedback snippet?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("feedback_snippets").delete().eq("id", item.id);
      if (error) throw error;
      if (editingId === item.id) reset();
      toast.success("Feedback snippet deleted.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete feedback snippet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Feedback bank"
        sub="Create and maintain reusable criterion comments for marking."
      />
      <section
        className="mb-8 space-y-3 rounded-xl border bg-card p-5 shadow-card"
        aria-label="Feedback snippet editor"
      >
        <h2 className="text-lg font-semibold">
          {editingId ? "Edit feedback snippet" : "New feedback snippet"}
        </h2>
        <div className="flex flex-wrap gap-3">
          <Select value={code} onValueChange={setCode}>
            <SelectTrigger className="w-36" aria-label="Criterion">
              <SelectValue placeholder="Criterion" />
            </SelectTrigger>
            <SelectContent>
              {criteria.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            className="min-w-60 flex-1"
            aria-label="Feedback text"
            placeholder="e.g. Add a labelled diagram showing how the components connect."
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
          />
        </div>
        <div className="flex justify-end gap-2">
          {editingId && (
            <Button type="button" variant="outline" onClick={reset} disabled={busy}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          )}
          <Button
            type="button"
            onClick={() => void save()}
            disabled={busy || criteria.length === 0}
          >
            {editingId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {busy ? "Saving…" : editingId ? "Save changes" : "Add snippet"}
          </Button>
        </div>
      </section>
      {criteriaResult.error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Could not load criteria: {criteriaResult.error.message}
        </p>
      )}
      {snippetsResult.error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Could not load feedback snippets: {snippetsResult.error.message}
        </p>
      )}
      {snippetsResult.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading feedback bank…</p>
      ) : (
        criteria.map((criterion) => {
          const items = list.filter((item) => item.criterion_code === criterion.code);
          if (!items.length) return null;
          return (
            <section key={criterion.code} className="mb-6">
              <h2 className="mb-2 font-mono font-bold">{criterion.code}</h2>
              {items.map((item) => (
                <article
                  key={item.id}
                  className="mb-2 flex flex-wrap items-start gap-3 rounded-lg border bg-card p-3 text-sm"
                >
                  <p className="flex-1 whitespace-pre-wrap">{item.body}</p>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Edit snippet"
                    title="Edit"
                    disabled={busy}
                    onClick={() => startEdit(item)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete snippet"
                    title="Delete"
                    disabled={busy}
                    onClick={() => void remove(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </article>
              ))}
            </section>
          );
        })
      )}
      {!snippetsResult.isLoading && !snippetsResult.error && list.length === 0 && (
        <p className="text-sm text-muted-foreground">No feedback snippets yet.</p>
      )}
    </div>
  );
}
