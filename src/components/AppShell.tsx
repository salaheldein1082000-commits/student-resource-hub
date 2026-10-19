import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BookOpen, LayoutDashboard, Megaphone, FolderCog, ClipboardList, MessageSquareQuote, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";

const linkCls =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const activeCls = "bg-sidebar-accent text-sidebar-primary";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isAssessor = me?.role === "assessor";

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-60">
        <Link to="/dashboard" className="px-3 py-2 font-display text-lg font-bold">Unit 1 Studio</Link>
        <p className="px-3 font-mono text-[10px] uppercase tracking-widest text-sidebar-primary">
          {isAssessor ? "Assessor" : "Student"}
        </p>
        <nav className="mt-6 flex flex-row flex-wrap gap-1 md:flex-col">
          <Link to="/dashboard" className={linkCls} activeProps={{ className: activeCls }}>
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Link>
          <Link to="/resources" className={linkCls} activeProps={{ className: activeCls }}>
            <BookOpen className="h-4 w-4" /> Resources
          </Link>
          {isAssessor && (
            <>
              <p className="mt-4 hidden px-3 text-[10px] uppercase tracking-widest text-sidebar-foreground/50 md:block">Manage</p>
              <Link to="/manage/assignments" className={linkCls} activeProps={{ className: activeCls }}>
                <ClipboardList className="h-4 w-4" /> Assignments
              </Link>
              <Link to="/manage/resources" className={linkCls} activeProps={{ className: activeCls }}>
                <FolderCog className="h-4 w-4" /> Resources
              </Link>
              <Link to="/manage/announcements" className={linkCls} activeProps={{ className: activeCls }}>
                <Megaphone className="h-4 w-4" /> Announcements
              </Link>
              <Link to="/manage/snippets" className={linkCls} activeProps={{ className: activeCls }}>
                <MessageSquareQuote className="h-4 w-4" /> Feedback bank
              </Link>
            </>
          )}
        </nav>
        <div className="mt-auto hidden border-t border-sidebar-border pt-4 md:block">
          <p className="truncate px-3 text-sm">{me?.name}</p>
          <button onClick={signOut} className={linkCls + " w-full"}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
        <button onClick={signOut} className={linkCls + " md:hidden"}>
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-8 md:px-10">{children}</main>
    </div>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
        {sub && <p className="mt-1 text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
