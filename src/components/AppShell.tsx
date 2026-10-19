import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  BookOpen,
  LayoutDashboard,
  Megaphone,
  FolderCog,
  ClipboardList,
  MessageSquareQuote,
  LogOut,
  Users,
  Upload,
  ClipboardCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/auth";
import { useLocale } from "@/lib/locale";

const linkCls =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const activeCls = "bg-sidebar-accent text-sidebar-primary";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { locale, toggleLocale, t } = useLocale();
  const isLeader = me?.role === "unit_leader";
  const isEngineer = me?.role === "engineer";
  const isStaff = isLeader || isEngineer;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-64">
        <Link to="/dashboard" className="px-3 py-2 font-display text-lg font-bold">
          BTEC Assessment Portal
        </Link>
        <p className="px-3 text-xs text-sidebar-foreground/70">
          Elsewedy Technical Academy · Unit 1
        </p>
        <p className="px-3 font-mono text-[10px] uppercase tracking-widest text-sidebar-primary">
          {isLeader ? t("unitLeader") : isEngineer ? t("engineer") : t("student")}
        </p>
        <nav className="mt-6 flex flex-row flex-wrap gap-1 md:flex-col">
          <Link to="/dashboard" className={linkCls} activeProps={{ className: activeCls }}>
            <LayoutDashboard className="h-4 w-4" /> {t("dashboard")}
          </Link>
          <Link to="/resources" className={linkCls} activeProps={{ className: activeCls }}>
            <BookOpen className="h-4 w-4" /> {t("resources")}
          </Link>
          {isStaff && (
            <Link
              to="/manage/submissions"
              className={linkCls}
              activeProps={{ className: activeCls }}
            >
              <ClipboardCheck className="h-4 w-4" /> {t("submissions")}
            </Link>
          )}
          {isLeader && (
            <>
              <p className="mt-4 hidden px-3 text-[10px] uppercase tracking-widest text-sidebar-foreground/50 md:block">
                {t("manage")}
              </p>
              <Link to="/manage/classes" className={linkCls} activeProps={{ className: activeCls }}>
                <Users className="h-4 w-4" /> {t("classes")}
              </Link>
              <Link to="/manage/import" className={linkCls} activeProps={{ className: activeCls }}>
                <Upload className="h-4 w-4" /> {t("importStudents")}
              </Link>
              <Link
                to="/manage/assignments"
                className={linkCls}
                activeProps={{ className: activeCls }}
              >
                <ClipboardList className="h-4 w-4" /> {t("assignments")}
              </Link>
              <Link
                to="/manage/resources"
                className={linkCls}
                activeProps={{ className: activeCls }}
              >
                <FolderCog className="h-4 w-4" /> {t("resources")}
              </Link>
              <Link
                to="/manage/announcements"
                className={linkCls}
                activeProps={{ className: activeCls }}
              >
                <Megaphone className="h-4 w-4" /> {t("announcements")}
              </Link>
              <Link
                to="/manage/snippets"
                className={linkCls}
                activeProps={{ className: activeCls }}
              >
                <MessageSquareQuote className="h-4 w-4" /> {t("feedbackBank")}
              </Link>
            </>
          )}
        </nav>
        <div className="mt-auto hidden border-t border-sidebar-border pt-4 md:block">
          <button onClick={toggleLocale} className={linkCls + " mb-2 w-full"}>
            <span className="w-4 text-center">文</span>{" "}
            {locale === "en" ? "العربية · RTL" : "English · LTR"}
          </button>
          <p className="truncate px-3 text-sm">{me?.name}</p>
          <button onClick={signOut} className={linkCls + " w-full"}>
            <LogOut className="h-4 w-4" /> {t("signOut")}
          </button>
        </div>
        <div className="flex gap-2 md:hidden">
          <button onClick={toggleLocale} className={linkCls}>
            {locale === "en" ? "العربية" : "English"}
          </button>
          <button onClick={signOut} className={linkCls}>
            <LogOut className="h-4 w-4" /> {t("signOut")}
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-8 md:px-10">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string | undefined;
  children?: ReactNode;
}) {
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
