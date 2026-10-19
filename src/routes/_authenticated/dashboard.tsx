import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/AppShell";
import { useMe } from "@/lib/auth";
import { assignmentsQuery, criteriaQuery, latestAttempt, submissionsQuery, type SubmissionFull } from "@/lib/data";
import { criteriaAchievement, submissionRate } from "@/lib/stats";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Unit 1 Studio" },
      { name: "description", content: "Your Unit 1 assignments, submissions and progress." },
      { property: "og:title", content: "Dashboard — Unit 1 Studio" },
      { property: "og:description", content: "Unit 1 assignments and progress." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useMe();
  if (!me) return null;
  return me.role === "assessor" ? <AssessorDash /> : <StudentDash name={me.name} />;
}

export function statusOf(s?: SubmissionFull) {
  if (!s) return { label: "Not submitted", cls: "border-dashed" };
  const a = latestAttempt(s);
  if (!a?.assessed_at) return { label: "Awaiting feedback", cls: "bg-secondary text-secondary-foreground" };
  if (s.status === "resubmission") return { label: "Resubmission allowed", cls: "bg-accent text-accent-foreground" };
  return { label: "Assessed", cls: "bg-success text-success-foreground" };
}

function StudentDash({ name }: { name: string }) {
  const { data: assignments = [] } = useQuery(assignmentsQuery);
  const { data: subs = [] } = useQuery(submissionsQuery);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Hi, ${name.split(" ")[0]}`} sub="Your Unit 1 assignments." />
      <div className="space-y-3">
        {assignments.length === 0 && <p className="text-muted-foreground">No assignments yet.</p>}
        {assignments.map((a) => {
          const s = subs.find((x) => x.assignment_id === a.id);
          const st = statusOf(s);
          const att = s && latestAttempt(s);
          const met = att?.criterion_results.filter((r) => r.achieved).length ?? 0;
          return (
            <Link key={a.id} to="/assignments/$id" params={{ id: a.id }}
              className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-card transition hover:border-primary">
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg font-bold">{a.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {a.due_date ? `Due ${format(new Date(a.due_date), "d MMM yyyy")}` : "No deadline"} · {a.criteria_codes.join(", ")}
                </p>
              </div>
              {att?.assessed_at && <span className="font-mono text-sm">{met}/{a.criteria_codes.length}</span>}
              <Badge variant="outline" className={st.cls}>{st.label}</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function AssessorDash() {
  const { data: assignments = [] } = useQuery(assignmentsQuery);
  const { data: subs = [] } = useQuery(submissionsQuery);
  const { data: criteria = [] } = useQuery(criteriaQuery);
  const { data: studentCount = 0 } = useQuery({
    queryKey: ["studentCount"],
    queryFn: async () => {
      const { count } = await supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "student");
      return count ?? 0;
    },
  });

  const rate = submissionRate(studentCount, assignments.length, subs.length);
  const awaiting = subs.filter((s) => !latestAttempt(s)?.assessed_at);
  const results = subs.flatMap((s) => {
    const a = latestAttempt(s);
    return a?.assessed_at ? a.criterion_results : [];
  });
  const ach = criteriaAchievement(results);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Assessor dashboard" sub="Submissions and criteria achievement across Unit 1." />
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Students" value={studentCount} />
        <Stat label="Submission rate" value={`${rate}%`} />
        <Stat label="Submissions" value={subs.length} />
        <Stat label="Awaiting feedback" value={awaiting.length} />
      </div>

      <h2 className="mb-4 mt-12 text-xl font-bold">Criteria achievement</h2>
      <div className="rounded-xl border bg-card p-6 shadow-card">
        {criteria.map((c) => {
          const x = ach[c.code];
          return (
            <div key={c.code} className="flex items-center gap-4 py-1.5">
              <span className="w-16 font-mono text-sm">{c.code}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${x?.pct ?? 0}%` }} />
              </div>
              <span className="w-24 text-right text-sm text-muted-foreground">
                {x ? `${x.pct}% (${x.achieved}/${x.total})` : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <h2 className="mb-4 mt-12 text-xl font-bold">Submissions</h2>
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        {subs.length === 0 && <p className="p-6 text-muted-foreground">No submissions yet.</p>}
        {subs.map((s) => {
          const a = assignments.find((x) => x.id === s.assignment_id);
          const att = latestAttempt(s);
          const st = statusOf(s);
          return (
            <Link key={s.id} to="/manage/submissions/$id" params={{ id: s.id }}
              className="flex items-center gap-4 border-b p-4 last:border-0 hover:bg-muted">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.profiles?.full_name ?? s.profiles?.email}</p>
                <p className="text-sm text-muted-foreground">{a?.title} · attempt {att?.attempt_no}</p>
              </div>
              <span className="text-sm text-muted-foreground">{format(new Date(s.updated_at), "d MMM, HH:mm")}</span>
              <Badge variant="outline" className={st.cls}>{st.label}</Badge>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold">{value}</p>
    </div>
  );
}
