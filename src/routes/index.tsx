import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BookOpen, FileCheck2, MessageSquareText } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Unit 1 Studio — IT Infrastructure coursework hub" },
      { name: "description", content: "One place for Unit 1 IT Infrastructure: submit work, read feedback, and study the resources your assessor picked." },
      { property: "og:title", content: "Unit 1 Studio — IT Infrastructure coursework hub" },
      { property: "og:description", content: "Submit work, read feedback, and study curated resources for Unit 1." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-lg font-bold">Unit&nbsp;1 Studio</span>
        <Button asChild variant="outline"><Link to="/auth">Sign in</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Unit 1 · IT Infrastructure</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-[1.05] md:text-7xl">
          Your coursework, feedback and study materials in one place.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Hand in your work, see exactly which criteria you've met, and find the materials that help you reach the next grade.
        </p>
        <Button asChild size="lg" className="mt-10"><Link to="/auth">Sign in with Google</Link></Button>
        <div className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { icon: FileCheck2, t: "Submit & track", d: "Upload each attempt with a signed declaration. Your full history stays here." },
            { icon: MessageSquareText, t: "Criterion feedback", d: "See every Pass, Merit and Distinction criterion and what's still to do." },
            { icon: BookOpen, t: "Resources hub", d: "Videos, PDFs and templates, grouped by learning aim and linked to criteria." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-xl border bg-card p-6 shadow-card">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 text-xl font-bold">{t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
