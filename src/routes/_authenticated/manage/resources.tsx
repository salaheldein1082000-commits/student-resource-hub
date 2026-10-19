import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/AppShell";
import { CriteriaPicker } from "@/components/CriteriaPicker";
import { TYPE_ICON } from "@/components/resources";
import { LEARNING_AIMS, resourcesQuery, type Resource } from "@/lib/data";
import { RESOURCE_TYPES } from "@/lib/embed";

export const Route = createFileRoute("/_authenticated/manage/resources")({
  head: () => ({
    meta: [
      { title: "Manage resources — Unit 1 Studio" },
      { name: "description", content: "Add, edit, reorder, pin and hide Unit 1 resources." },
      { property: "og:title", content: "Manage resources — Unit 1 Studio" },
      { property: "og:description", content: "Assessor resource management." },
    ],
  }),
  component: ManageResources,
});

type Draft = Partial<Resource>;
const empty: Draft = { learning_aim: "A", type: "video", title: "", url: "", description: "", linked_criteria: [], is_published: true, is_pinned: false };

function ManageResources() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery(resourcesQuery);
  const { data: views = [] } = useQuery({
    queryKey: ["resource_views"],
    queryFn: async () => (await supabase.from("resource_views").select("resource_id, student_id, viewed_at, profiles(full_name)").order("viewed_at", { ascending: false })).data ?? [],
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [viewsFor, setViewsFor] = useState<Resource | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["resources"] });

  async function save() {
    if (!draft?.title || !draft.url) { toast.error("Title and URL are required"); return; }
    const row = {
      title: draft.title, url: draft.url, type: draft.type!, learning_aim: draft.learning_aim!,
      description: draft.description || null, linked_criteria: draft.linked_criteria ?? [],
      is_published: draft.is_published ?? true, is_pinned: draft.is_pinned ?? false,
      visible_from: draft.visible_from || null,
      sort_order: draft.sort_order ?? (list.length ? Math.max(...list.map((r) => r.sort_order)) + 1 : 0),
    };
    const res = draft.id ? await supabase.from("resources").update(row).eq("id", draft.id) : await supabase.from("resources").insert(row);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success("Saved");
    setDraft(null);
    refresh();
  }

  async function patch(id: string, p: Partial<Resource>) {
    const { error } = await supabase.from("resources").update(p).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  }

  async function move(aimList: Resource[], i: number, dir: -1 | 1) {
    const a = aimList[i], b = aimList[i + dir];
    if (!a || !b) return;
    await Promise.all([
      supabase.from("resources").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("resources").update({ sort_order: a.sort_order === b.sort_order ? a.sort_order + dir : a.sort_order }).eq("id", b.id),
    ]);
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this resource?")) return;
    await supabase.from("resources").delete().eq("id", id);
    refresh();
  }

  const aims = Object.keys(LEARNING_AIMS);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Manage resources" sub="Pinned items show first. Hidden items are invisible to students.">
        <Button onClick={() => setDraft({ ...empty })}><Plus className="h-4 w-4" /> Add resource</Button>
      </PageHeader>
      {aims.map((aim) => {
        const items = list.filter((r) => r.learning_aim === aim).sort((a, b) => a.sort_order - b.sort_order);
        return (
          <section key={aim} className="mb-10">
            <h2 className="mb-3 text-lg font-bold">{LEARNING_AIMS[aim]}</h2>
            <div className="overflow-hidden rounded-xl border bg-card shadow-card">
              {items.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing here yet.</p>}
              {items.map((r, i) => {
                const Icon = TYPE_ICON[r.type as keyof typeof TYPE_ICON];
                const vc = views.filter((v) => v.resource_id === r.id);
                return (
                  <div key={r.id} className={"flex items-center gap-3 border-b p-3 last:border-0 " + (r.is_published ? "" : "opacity-50")}>
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.title}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{r.linked_criteria.join(" · ") || "no criteria"}</p>
                    </div>
                    {r.visible_from && new Date(r.visible_from) > new Date() && <Badge variant="outline">Scheduled</Badge>}
                    <Button size="sm" variant="ghost" onClick={() => setViewsFor(r)}>{new Set(vc.map((v) => v.student_id)).size} viewers</Button>
                    <Button size="icon" variant="ghost" onClick={() => move(items, i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => move(items, i, 1)} disabled={i === items.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="Pin" onClick={() => patch(r.id, { is_pinned: !r.is_pinned })}>
                      {r.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" title="Show/hide" onClick={() => patch(r.id, { is_published: !r.is_published })}>
                      {r.is_published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDraft(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{draft?.id ? "Edit resource" : "New resource"}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div><Label>Title</Label><Input value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Type</Label>
                  <Select value={draft.type ?? "video"} onValueChange={(v) => setDraft({ ...draft, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RESOURCE_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Learning aim</Label>
                  <Select value={draft.learning_aim ?? "A"} onValueChange={(v) => setDraft({ ...draft, learning_aim: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{aims.map((a) => <SelectItem key={a} value={a}>Aim {a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>URL</Label><Input placeholder="YouTube / Vimeo / PDF / Drive link" value={draft.url ?? ""} onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
              <div><Label>Linked criteria</Label><CriteriaPicker value={draft.linked_criteria ?? []} onChange={(v) => setDraft({ ...draft, linked_criteria: v })} /></div>
              <div><Label>Visible from (optional)</Label>
                <Input type="datetime-local" value={draft.visible_from ? draft.visible_from.slice(0, 16) : ""}
                  onChange={(e) => setDraft({ ...draft, visible_from: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </div>
              <Button onClick={save} className="w-full">Save</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewsFor} onOpenChange={(o) => !o && setViewsFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Who opened “{viewsFor?.title}”</DialogTitle></DialogHeader>
          <div className="max-h-80 space-y-1 overflow-auto text-sm">
            {views.filter((v) => v.resource_id === viewsFor?.id).map((v, i) => (
              <div key={i} className="flex justify-between border-b py-1.5">
                <span>{v.profiles?.full_name ?? "Student"}</span>
                <span className="text-muted-foreground">{new Date(v.viewed_at).toLocaleString()}</span>
              </div>
            ))}
            {!views.some((v) => v.resource_id === viewsFor?.id) && <p className="text-muted-foreground">No views yet.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
