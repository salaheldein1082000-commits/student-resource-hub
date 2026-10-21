import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/AppShell";
import { announcementsQuery } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/manage/announcements")({
  head: () => ({
    meta: [
      { title: "Announcements — BTEC Assessment Portal" },
      { name: "description", content: "Post and manage student announcements." },
    ],
  }),
  component: Announcements,
});

type Draft = { id?: string; title: string; body: string; kind: string; expires: string };
const blank: Draft = { title: "", body: "", kind: "deadline", expires: "" };

function Announcements() {
  const qc = useQueryClient();
  const { data: list = [], isLoading, error } = useQuery(announcementsQuery);
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["announcements"] });
  };

  function edit(item: (typeof list)[number]) {
    setDraft({
      id: item.id,
      title: item.title,
      body: item.body ?? "",
      kind: item.kind,
      expires: item.expires_at ? item.expires_at.slice(0, 10) : "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!draft.title.trim()) {
      toast.error("Enter an announcement title.");
      return;
    }
    setBusy(true);
    const values = {
      title: draft.title.trim(),
      body: draft.body.trim() || null,
      kind: draft.kind,
      expires_at: draft.expires ? new Date(`${draft.expires}T23:59:59`).toISOString() : null,
    };
    try {
      const result = draft.id
        ? await supabase.from("announcements").update(values).eq("id", draft.id)
        : await supabase.from("announcements").insert(values);
      if (result.error) throw result.error;
      toast.success(draft.id ? "Announcement updated." : "Announcement posted.");
      setDraft({ ...blank });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save announcement.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(item: (typeof list)[number]) {
    setBusy(true);
    try {
      const { error: updateError } = await supabase
        .from("announcements")
        .update({ is_published: !item.is_published })
        .eq("id", item.id);
      if (updateError) throw updateError;
      toast.success(item.is_published ? "Announcement hidden." : "Announcement published.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update announcement.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: (typeof list)[number]) {
    if (!window.confirm(`Permanently delete “${item.title}”?`)) return;
    setBusy(true);
    try {
      const { error: deleteError } = await supabase
        .from("announcements")
        .delete()
        .eq("id", item.id);
      if (deleteError) throw deleteError;
      toast.success("Announcement deleted.");
      if (draft.id === item.id) setDraft({ ...blank });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete announcement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Announcements"
        sub="Create, edit, publish, hide, and remove notices shown to students."
      />
      <section
        className="mb-8 space-y-3 rounded-xl border bg-card p-5 shadow-card"
        aria-label="Announcement editor"
      >
        <h2 className="text-lg font-semibold">
          {draft.id ? "Edit announcement" : "New announcement"}
        </h2>
        <Input
          aria-label="Title"
          placeholder="Title, e.g. Learning aim B due Friday"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          maxLength={180}
        />
        <Textarea
          aria-label="Details"
          placeholder="Details (optional)"
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Kind</Label>
            <Select value={draft.kind} onValueChange={(kind) => setDraft({ ...draft, kind })}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deadline">Deadline</SelectItem>
                <SelectItem value="exam tip">Exam tip</SelectItem>
                <SelectItem value="notice">Notice</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="announcement-expiry">Hide after (optional)</Label>
            <Input
              id="announcement-expiry"
              type="date"
              value={draft.expires}
              onChange={(e) => setDraft({ ...draft, expires: e.target.value })}
            />
          </div>
          <div className="ml-auto flex gap-2">
            {draft.id && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraft({ ...blank })}
                disabled={busy}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel edit
              </Button>
            )}
            <Button type="button" onClick={() => void save()} disabled={busy}>
              <Plus className="mr-2 h-4 w-4" />
              {busy ? "Saving…" : draft.id ? "Save changes" : "Post"}
            </Button>
          </div>
        </div>
      </section>
      <div className="space-y-2">
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading announcements…</p>}
        {error && (
          <p className="p-4 text-sm text-destructive" role="alert">
            Could not load announcements: {error.message}
          </p>
        )}
        {!isLoading && !error && list.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No announcements yet.</p>
        )}
        {list.map((item) => (
          <article
            key={item.id}
            className={`flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4 ${item.is_published ? "" : "opacity-60"}`}
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                <span className="mr-2 font-mono text-[10px] uppercase text-muted-foreground">
                  {item.kind}
                </span>
                {item.title}
              </p>
              {item.body && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {item.body}
                </p>
              )}
              {item.expires_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Hide after {new Date(item.expires_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label={item.is_published ? "Hide announcement" : "Publish announcement"}
              title={item.is_published ? "Hide" : "Publish"}
              disabled={busy}
              onClick={() => void togglePublished(item)}
            >
              {item.is_published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Edit announcement"
              title="Edit"
              disabled={busy}
              onClick={() => edit(item)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Delete announcement"
              title="Delete"
              disabled={busy}
              onClick={() => void remove(item)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </article>
        ))}
      </div>
    </div>
  );
}
