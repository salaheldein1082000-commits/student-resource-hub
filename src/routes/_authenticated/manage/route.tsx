import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { meQuery } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/manage")({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me?.role !== "unit_leader" && me?.role !== "engineer") {
      throw redirect({ to: "/dashboard" });
    }
    if (me.role === "engineer" && !location.pathname.startsWith("/manage/submissions")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => <Outlet />,
});
