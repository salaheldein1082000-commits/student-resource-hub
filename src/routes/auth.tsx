import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Unit 1 Studio" },
      {
        name: "description",
        content: "Sign in with your student code to access Unit 1 coursework and resources.",
      },
      { property: "og:title", content: "Sign in — Unit 1 Studio" },
      {
        property: "og:description",
        content: "Sign in with your student code to access Unit 1 coursework.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: "/dashboard", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = code.trim();
    if (!/^\d{8}$/.test(normalizedCode)) {
      toast.error("Enter your 8-digit student code.");
      return;
    }
    if (!password) {
      toast.error("Enter your password.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: `${normalizedCode}@student.local`,
      password,
    });
    if (error) {
      toast.error("Student code or password is incorrect.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hero px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-card">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Unit 1 Studio</p>
          <h1 className="mt-3 text-3xl font-bold">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in with your student code.</p>
        </div>
        <form onSubmit={signIn} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="student-code">Student code</Label>
            <Input
              id="student-code"
              inputMode="numeric"
              autoComplete="username"
              maxLength={8}
              placeholder="e.g. 01090680"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="student-password">Password</Label>
            <Input
              id="student-password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} size="lg" className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
