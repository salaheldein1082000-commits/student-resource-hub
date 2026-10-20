import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { portalDb, type PortalRole } from "@/lib/portal";

export type Me = {
  id: string;
  email: string | null;
  name: string;
  avatar: string | null;
  role: PortalRole;
  classId: string | null;
  groupName: string | null;
};

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    if (!user) return null;

    const { data: profile, error: profileError } = await portalDb
      .from("profiles")
      .select("id, full_name, email, avatar_url, role, class_id, group_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    let role: PortalRole = "student";
    if (
      profile?.role === "unit_leader" ||
      profile?.role === "engineer" ||
      profile?.role === "student"
    ) {
      role = profile.role;
    } else {
      const { data: roles } = await portalDb
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      role = roles?.some((item: { role: string }) => item.role === "assessor")
        ? "unit_leader"
        : "student";
    }

    return {
      id: user.id,
      email: user.email ?? null,
      name: profile?.full_name ?? user.email ?? "Student",
      avatar: profile?.avatar_url ?? null,
      role,
      classId: profile?.class_id ?? null,
      groupName: profile?.group_name ?? null,
    };
  },
  staleTime: 5 * 60_000,
});

export function useMe() {
  return useQuery(meQuery);
}
