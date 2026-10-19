import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/AppShell";
import { CriteriaPicker } from "@/components/CriteriaPicker";
import { assignmentsQuery } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/manage/assignments")({
  head: () => ({
    meta: [
      { title: "Assignments — Unit 1 Studio" },
      { name: "description", content: "Create Unit 1 assignments and choose their criteria." },
      { property: "og:title", content: "Assignments — Unit 1 Studio" },
      { property: "og:description", content: "Assessor assignment setup." },
    ],
  }),
  component: Assignments,
});

function Assignments() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery(assignmentsQuery);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [due, setDue] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["assignments"] });

  async function add() {
    if (!title) return;
    const { error } = await supabase.from("assignments").insert({ title, brief: brief || null, due_date: due || null, criteria_codes: codes });
    if (error) { toast.error(error.message); return; }
    setTitle(""); setBrief(""); setDue(""); setCodes([]);
    refresh();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Assignments" sub="Students see these on their dashboard." />
      <div className="mb-8 space-y-3 rounded-xl border bg-card p-5 shadow-card">
        <Input placeholder="Title, e.g. Learning aim A report" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea placeholder="Brief" value={brief} onChange={(e) => setBrief(e.target.value)} />
        <div><Label>Due date</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        <div><Label>Criteria</Label><CriteriaPicker value={codes} onChange={setCodes} /></div>
        <Button onClick={add}>Create assignment</Button>
      </div>
      {list.map((a) => (
        <div key={a.id} className="mb-2 flex items-center gap-3 rounded-lg border bg-card p-4">
          <div className="flex-1">
            <p className="font-semibold">{a.title}</p>
            <p className="font-mono text-xs text-muted-foreground">{a.due_date ?? "no deadline"} · {a.criteria_codes.join(", ")}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={async () => { if (!confirm("Delete assignment and its submissions?")) return; await supabase.from("assignments").delete().eq("id", a.id); refresh(); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
