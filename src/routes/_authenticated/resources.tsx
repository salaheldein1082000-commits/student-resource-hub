import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Megaphone, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/AppShell";
import { ResourceCard } from "@/components/resources";
import { announcementsQuery, criteriaQuery, LEARNING_AIMS, resourcesQuery } from "@/lib/data";
import { RESOURCE_TYPES } from "@/lib/embed";

export const Route = createFileRoute("/_authenticated/resources")({
  head: () => ({
    meta: [
      { title: "Resources — Unit 1 Studio" },
      { name: "description", content: "Videos, PDFs, slides and templates for Unit 1, grouped by learning aim." },
      { property: "og:title", content: "Resources — Unit 1 Studio" },
      { property: "og:description", content: "Study materials for Unit 1 IT Infrastructure." },
    ],
  }),
  component: ResourcesPage,
});

function ResourcesPage() {
  const { data: resources = [], isLoading } = useQuery(resourcesQuery);
  const { data: criteria = [] } = useQuery(criteriaQuery);
  const { data: notices = [] } = useQuery(announcementsQuery);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [crit, setCrit] = useState("all");

  const live = notices.filter((n) => n.is_published && (!n.expires_at || new Date(n.expires_at) > new Date()));

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return resources.filter(
      (r) =>
        r.is_published &&
        (type === "all" || r.type === type) &&
        (crit === "all" || r.linked_criteria.includes(crit)) &&
        (!s || r.title.toLowerCase().includes(s) || (r.description ?? "").toLowerCase().includes(s)),
    );
  }, [resources, q, type, crit]);

  const aims = Array.from(new Set(filtered.map((r) => r.learning_aim))).sort();

  return (
    <div className="mx-auto max-w-6xl">
      {live.length > 0 && (
        <div className="mb-8 space-y-2">
          {live.map((n) => (
            <div key={n.id} className="flex gap-3 rounded-xl border border-accent bg-accent/20 p-4">
              <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-accent-foreground" />
              <div>
                <p className="font-semibold">
                  <span className="mr-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{n.kind}</span>
                  {n.title}
                </p>
                {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      <PageHeader title="Resources" sub="Everything your assessor has shared for Unit 1." />
      <div className="mb-8 flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search resources…" className="pl-9" />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {RESOURCE_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={crit} onValueChange={setCrit}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All criteria</SelectItem>
            {criteria.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : aims.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">No resources match.</p>
      ) : (
        aims.map((aim) => (
          <section key={aim} className="mb-12">
            <h2 className="mb-4 text-xl font-bold">{LEARNING_AIMS[aim] ?? `Learning aim ${aim}`}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.filter((r) => r.learning_aim === aim).map((r) => <ResourceCard key={r.id} r={r} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
