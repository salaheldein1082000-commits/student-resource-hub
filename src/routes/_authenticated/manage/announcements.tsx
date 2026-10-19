import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/AppShell";
import { announcementsQuery } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/manage/announcements")({
  head: () => ({
    meta: [
      { title: "Announcements — Unit 1 Studio" },
      { name: "description", content: "Post deadline reminders and exam tips to the Resources page." },
      { property: "og:title", content: "Announcements — Unit 1 Studio" },
      { property: "og:description", content: "Assessor notices." },
    ],
  }),
  component: Announcements,
});

function Announcements() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery(announcementsQuery);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("deadline");
  const [expires, setExpires] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["announcements"] });

  async function add() {
    if (!title) return;
    const { error } = await supabase.from("announcements").insert({
      title, body: body || null, kind, expires_at: expires ? new Date(expires).toISOString() : null,
    });
    if (error) return toast.error(error.message);
    setTitle(""); setBody(""); setExpires("");
    refresh();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Announcements" sub="Shown as a strip at the top of the Resources page." />
      <div className="mb-8 space-y-3 rounded-xl border bg-card p-5 shadow-card">
        <Input placeholder="Title, e.g. Learning aim B due Friday" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea placeholder="Details (optional)" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex flex-wrap items-end gap-3">
          <div><Label>Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="deadline">Deadline</SelectItem>
                <SelectItem value="exam tip">Exam tip</SelectItem>
                <SelectItem value="notice">Notice</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Hide after (optional)</Label><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
          <Button onClick={add} className="ml-auto">Post</Button>
        </div>
      </div>
      <div className="space-y-2">
        {list.map((n) => (
          <div key={n.id} className={"flex items-center gap-3 rounded-lg border bg-card p-4 " + (n.is_published ? "" : "opacity-50")}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold"><span className="mr-2 font-mono text-[10px] uppercase text-muted-foreground">{n.kind}</span>{n.title}</p>
              {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
            </div>
            <Button size="icon" variant="ghost" onClick={async () => { await supabase.from("announcements").update({ is_published: !n.is_published }).eq("id", n.id); refresh(); }}>
              {n.is_published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={async () => { await supabase.from("announcements").delete().eq("id", n.id); refresh(); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
