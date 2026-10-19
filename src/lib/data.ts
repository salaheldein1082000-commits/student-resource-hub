import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Resource = Database["public"]["Tables"]["resources"]["Row"];
export type Criterion = Database["public"]["Tables"]["criteria"]["Row"];
export type Assignment = Database["public"]["Tables"]["assignments"]["Row"];
export type Announcement = Database["public"]["Tables"]["announcements"]["Row"];

export const LEARNING_AIMS: Record<string, string> = {
  A: "Learning aim A — Understand IT infrastructure",
  B: "Learning aim B — Design an IT infrastructure",
  C: "Learning aim C — Implement and test an IT infrastructure",
};

const must = <T>(r: { data: T | null; error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export const criteriaQuery = queryOptions({
  queryKey: ["criteria"],
  queryFn: async () => must(await supabase.from("criteria").select("*").order("sort_order")),
});

export const resourcesQuery = queryOptions({
  queryKey: ["resources"],
  queryFn: async () =>
    must(
      await supabase.from("resources").select("*").order("is_pinned", { ascending: false }).order("sort_order"),
    ),
});

export const announcementsQuery = queryOptions({
  queryKey: ["announcements"],
  queryFn: async () => must(await supabase.from("announcements").select("*").order("created_at", { ascending: false })),
});

export const assignmentsQuery = queryOptions({
  queryKey: ["assignments"],
  queryFn: async () => must(await supabase.from("assignments").select("*").order("due_date", { nullsFirst: false })),
});

/** Submissions with all attempts + results. RLS limits students to their own. */
export const submissionsQuery = queryOptions({
  queryKey: ["submissions"],
  queryFn: async () =>
    must(
      await supabase
        .from("submissions")
        .select("*, profiles(full_name, email), attempts(*, criterion_results(*))")
        .order("updated_at", { ascending: false }),
    ),
});

export type SubmissionFull = Awaited<ReturnType<NonNullable<typeof submissionsQuery.queryFn>>>[number];

export function latestAttempt(s: SubmissionFull) {
  return [...(s.attempts ?? [])].sort((a, b) => b.attempt_no - a.attempt_no)[0];
}

export async function logView(resourceId: string, studentId: string) {
  await supabase.from("resource_views").insert({ resource_id: resourceId, student_id: studentId });
}
