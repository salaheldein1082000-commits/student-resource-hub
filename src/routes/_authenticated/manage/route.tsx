import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { meQuery } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/manage")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me?.role !== "assessor") throw redirect({ to: "/dashboard" });
  },
  component: () => <Outlet />,
});
