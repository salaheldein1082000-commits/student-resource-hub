import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/AppShell";
import { criteriaQuery } from "@/lib/data";

export const snippetsQuery = {
  queryKey: ["snippets"],
  queryFn: async () => (await supabase.from("feedback_snippets").select("*").order("created_at")).data ?? [],
};

export const Route = createFileRoute("/_authenticated/manage/snippets")({
  head: () => ({
    meta: [
      { title: "Feedback bank — Unit 1 Studio" },
      { name: "description", content: "Reusable feedback comments for each criterion." },
      { property: "og:title", content: "Feedback bank — Unit 1 Studio" },
      { property: "og:description", content: "Reusable feedback comments." },
    ],
  }),
  component: Snippets,
});

function Snippets() {
  const qc = useQueryClient();
  const { data: criteria = [] } = useQuery(criteriaQuery);
  const { data: list = [] } = useQuery(snippetsQuery);
  const [code, setCode] = useState("A.P1");
  const [body, setBody] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["snippets"] });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Feedback bank" sub="Insert these with one click while marking." />
      <div className="mb-8 flex flex-wrap gap-3 rounded-xl border bg-card p-5 shadow-card">
        <Select value={code} onValueChange={setCode}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{criteria.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}</SelectContent>
        </Select>
        <Textarea className="min-w-60 flex-1" placeholder="e.g. Add a labelled diagram showing how the components connect." value={body} onChange={(e) => setBody(e.target.value)} />
        <Button onClick={async () => { if (!body) return; await supabase.from("feedback_snippets").insert({ criterion_code: code, body }); setBody(""); refresh(); }}>Add</Button>
      </div>
      {criteria.map((c) => {
        const items = list.filter((s) => s.criterion_code === c.code);
        if (!items.length) return null;
        return (
          <section key={c.code} className="mb-6">
            <h2 className="mb-2 font-mono font-bold">{c.code}</h2>
            {items.map((s) => (
              <div key={s.id} className="mb-2 flex items-start gap-3 rounded-lg border bg-card p-3 text-sm">
                <p className="flex-1">{s.body}</p>
                <Button size="icon" variant="ghost" onClick={async () => { await supabase.from("feedback_snippets").delete().eq("id", s.id); refresh(); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
