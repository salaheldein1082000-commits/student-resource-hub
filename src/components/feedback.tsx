import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, CircleDashed, Download, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ResourceCard } from "@/components/resources";
import { criteriaQuery, resourcesQuery, type SubmissionFull } from "@/lib/data";

type Attempt = SubmissionFull["attempts"][number];

export async function openFile(path: string) {
  const { data, error } = await supabase.storage.from("submissions").createSignedUrl(path, 300);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

export function AttemptHistory({ attempts }: { attempts: Attempt[] }) {
  const sorted = [...attempts].sort((a, b) => b.attempt_no - a.attempt_no);
  return (
    <ol className="space-y-2">
      {sorted.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm">
          <span className="font-mono font-semibold">#{a.attempt_no}</span>
          <span className="min-w-0 flex-1 truncate">{a.file_name}</span>
          <span className="flex items-center gap-1 text-muted-foreground" title="Declaration signed">
            <ShieldCheck className="h-4 w-4 text-success" /> {format(new Date(a.declared_at), "d MMM yyyy, HH:mm")}
          </span>
          <span className="text-muted-foreground">{a.assessed_at ? "Assessed" : "Awaiting"}</span>
          <Button size="sm" variant="ghost" onClick={() => openFile(a.file_path)}>
            <Download className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ol>
  );
}

/** Per-criterion outcome for an assessed attempt, plus helpful materials for anything not achieved. */
export function FeedbackView({ attempt, codes }: { attempt: Attempt; codes: string[] }) {
  const { data: criteria = [] } = useQuery(criteriaQuery);
  const { data: resources = [] } = useQuery(resourcesQuery);
  const rows = criteria.filter((c) => codes.includes(c.code));
  const missing = rows.filter((c) => !attempt.criterion_results.find((r) => r.criterion_code === c.code)?.achieved);

  return (
    <div className="space-y-6">
      {attempt.feedback && (
        <div className="rounded-xl border bg-card p-5 shadow-card">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Assessor feedback</p>
          <p className="whitespace-pre-wrap">{attempt.feedback}</p>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        {rows.map((c) => {
          const r = attempt.criterion_results.find((x) => x.criterion_code === c.code);
          return (
            <div key={c.code} className="flex gap-3 border-b p-4 last:border-0">
              {r?.achieved ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
              ) : (
                <CircleDashed className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p className="font-semibold">
                  <span className="font-mono">{c.code}</span> · {r?.achieved ? "Achieved" : "Not yet achieved"}
                </p>
                <p className="text-sm text-muted-foreground">{c.description}</p>
                {r?.comment && <p className="mt-2 text-sm">{r.comment}</p>}
              </div>
            </div>
          );
        })}
      </div>
      {missing.map((c) => {
        const helpful = resources.filter((r) => r.is_published && r.linked_criteria.includes(c.code));
        if (!helpful.length) return null;
        return (
          <section key={c.code}>
            <h3 className="mb-3 text-lg font-bold">Helpful materials for <span className="font-mono">{c.code}</span></h3>
            <div className="grid gap-4 sm:grid-cols-2">{helpful.map((r) => <ResourceCard key={r.id} r={r} />)}</div>
          </section>
        );
      })}
    </div>
  );
}
