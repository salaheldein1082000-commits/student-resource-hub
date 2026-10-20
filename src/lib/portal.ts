import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PortalRole = "unit_leader" | "engineer" | "student";

export type PortalProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: PortalRole;
  group_name: string | null;
  class_id: string | null;
};

export type PortalClass = {
  id: string;
  name: string;
  unit_no: number;
  capacity: number;
  created_at: string;
  engineer_id?: string | null;
};

export type PortalCriterion = {
  id: string;
  assignment_id: string | null;
  code: string;
  description: string;
  task_no: number | null;
  sort_order: number;
  grade: string;
};

export type PortalAssignment = {
  id: string;
  unit_no: number;
  title: string;
  brief: string | null;
  brief_pdf_url: string | null;
  due_date: string | null;
  part: number;
  total_parts: number;
  is_published: boolean;
  criteria_codes: string[];
  class_ids: string[];
  criteria: PortalCriterion[];
};

type AssignmentRow = Omit<PortalAssignment, "class_ids" | "criteria">;

export type PortalSubmission = {
  id: string;
  assignment_id: string;
  student_id: string;
  file_url: string;
  submitted_at: string;
  attempt_no: number;
  status: "submitted" | "graded" | "resubmission_allowed";
  profiles?: Pick<PortalProfile, "full_name" | "email" | "group_name" | "class_id"> | null;
  assignments?: Pick<PortalAssignment, "title" | "due_date"> | null;
};

// The migration adds fields and tables beyond the generated client snapshot. Keep this cast at the data boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const portalDb = supabase as unknown as SupabaseClient<any>;

function unwrap<T>(result: { data: unknown; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export const portalClassesQuery = queryOptions({
  queryKey: ["portal", "classes"],
  queryFn: async (): Promise<PortalClass[]> => {
    const [classes, assignments] = await Promise.all([
      portalDb.from("classes").select("*").order("name"),
      portalDb.from("class_engineers").select("class_id, engineer_id"),
    ]);
    const rows = unwrap<PortalClass[]>(classes);
    const staff = unwrap<Array<{ class_id: string; engineer_id: string }>>(assignments);
    return rows.map((item) => ({
      ...item,
      engineer_id: staff.find((x) => x.class_id === item.id)?.engineer_id ?? null,
    }));
  },
  staleTime: 30_000,
});

export const portalProfilesQuery = queryOptions({
  queryKey: ["portal", "profiles"],
  queryFn: async (): Promise<PortalProfile[]> =>
    unwrap(
      await portalDb
        .from("profiles")
        .select("id, full_name, email, role, group_name, class_id")
        .order("full_name"),
    ),
  staleTime: 30_000,
});

export type PortalStudent = Pick<PortalProfile, "id" | "full_name" | "group_name" | "class_id">;

export const portalStudentsQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["portal", "students", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<PortalStudent[]> =>
      unwrap(
        await portalDb
          .from("profiles")
          .select("id, full_name, group_name, class_id")
          .eq("role", "student")
          .order("full_name"),
      ),
    staleTime: 30_000,
  });

export const portalAssignmentsQuery = queryOptions({
  queryKey: ["portal", "assignments"],
  queryFn: async (): Promise<PortalAssignment[]> => {
    const [assignments, criteria, classLinks] = await Promise.all([
      portalDb.from("assignments").select("*").order("due_date", { nullsFirst: false }),
      portalDb.from("criteria").select("*").order("sort_order"),
      portalDb.from("assignment_classes").select("assignment_id, class_id"),
    ]);
    const aRows = unwrap<AssignmentRow[]>(assignments);
    const cRows = unwrap<PortalCriterion[]>(criteria);
    const links = unwrap<Array<{ assignment_id: string; class_id: string }>>(classLinks);
    return aRows.map((assignment) => ({
      ...assignment,
      class_ids: links.filter((x) => x.assignment_id === assignment.id).map((x) => x.class_id),
      criteria: cRows.filter((x) => x.assignment_id === assignment.id),
    }));
  },
  staleTime: 30_000,
});

export const portalAssignmentByIdQuery = (assignmentId: string | null) =>
  queryOptions({
    queryKey: ["portal", "assignment", assignmentId],
    enabled: Boolean(assignmentId),
    queryFn: async (): Promise<PortalAssignment> => {
      if (!assignmentId) throw new Error("Assignment ID is required.");
      const [assignmentResult, criteriaResult] = await Promise.all([
        portalDb.from("assignments").select("*").eq("id", assignmentId).maybeSingle(),
        portalDb.from("criteria").select("*").eq("assignment_id", assignmentId).order("sort_order"),
      ]);
      const assignment = unwrap<AssignmentRow | null>(assignmentResult);
      if (!assignment) throw new Error("The assignment was not found or is not available to you.");
      const criteria = unwrap<PortalCriterion[]>(criteriaResult);
      return {
        ...assignment,
        class_ids: [],
        criteria,
      };
    },
    staleTime: 30_000,
  });

export const portalSubmissionsQuery = queryOptions({
  queryKey: ["portal", "submissions"],
  queryFn: async (): Promise<PortalSubmission[]> =>
    unwrap<PortalSubmission[]>(
      await portalDb
        .from("submissions")
        .select(
          "id, assignment_id, student_id, file_url, submitted_at, attempt_no, status, profiles(full_name, email, group_name, class_id), assignments(title, due_date)",
        )
        .order("submitted_at", { ascending: false }),
    ),
  staleTime: 30_000,
});

export const portalSubmissionByIdQuery = (submissionId: string) =>
  queryOptions({
    queryKey: ["portal", "submission", submissionId],
    queryFn: async (): Promise<PortalSubmission | null> =>
      unwrap(
        await portalDb
          .from("submissions")
          .select(
            "id, assignment_id, student_id, file_url, submitted_at, attempt_no, status, profiles(full_name, email, group_name, class_id), assignments(title, due_date)",
          )
          .eq("id", submissionId)
          .maybeSingle(),
      ),
    staleTime: 30_000,
  });

export async function signedStorageUrl(
  bucket: "submissions" | "briefs",
  path: string,
  expiresIn = 300,
) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function openSubmissionFile(bucket: "submissions" | "briefs", path: string) {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  try {
    const url = await signedStorageUrl(bucket, path);
    if (tab && !tab.closed) tab.location.replace(url);
    else window.location.assign(url);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function submissionStatusLabel(status: PortalSubmission["status"]) {
  if (status === "graded") return "Graded";
  if (status === "resubmission_allowed") return "Resubmission allowed";
  return "Submitted";
}

export function getLatestAttempt<T extends { attempt_no: number }>(items: T[]) {
  return [...items].sort((a, b) => b.attempt_no - a.attempt_no)[0];
}
