import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Unit 1 Studio" },
      { name: "description", content: "Sign in with Google to access Unit 1 coursework and resources." },
      { property: "og:title", content: "Sign in — Unit 1 Studio" },
      { property: "og:description", content: "Sign in with Google to access Unit 1 coursework." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/dashboard", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function signIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth` },
    });
    if (error) {
      toast.error(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hero px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-card">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Unit 1 Studio</p>
        <h1 className="mt-3 text-3xl font-bold">Welcome back</h1>
        <p className="mt-2 text-sm text-muted-foreground">Use your school Google account.</p>
        <Button onClick={signIn} disabled={busy} size="lg" className="mt-8 w-full">
          {busy ? "Redirecting…" : "Continue with Google"}
        </Button>
      </div>
    </div>
  );
}
