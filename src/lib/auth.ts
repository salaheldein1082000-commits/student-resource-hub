import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Me = {
  id: string;
  email: string | null;
  name: string;
  avatar: string | null;
  role: "assessor" | "student";
};

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return null;
    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id),
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    ]);
    const isAssessor = roles?.some((r) => r.role === "assessor");
    return {
      id: user.id,
      email: user.email ?? null,
      name: profile?.full_name ?? user.email ?? "Student",
      avatar: profile?.avatar_url ?? null,
      role: isAssessor ? "assessor" : "student",
    };
  },
  staleTime: 60_000,
});

export function useMe() {
  return useQuery(meQuery);
}
