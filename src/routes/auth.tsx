import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/locale";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — BTEC Assessment Portal" },
      {
        name: "description",
        content: "Sign in to the BTEC Assessment Portal for Unit 1 coursework and feedback.",
      },
      { property: "og:title", content: "Sign in — BTEC Assessment Portal" },
      {
        property: "og:description",
        content: "Sign in to submit work and manage assessment feedback.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { locale, toggleLocale } = useLocale();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [isStaff, setIsStaff] = useState(false);
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
    const normalizedEmail = email.trim().toLowerCase();
    if (!isStaff && !/^\d{8}$/.test(normalizedCode)) {
      toast.error("Enter your 8-digit student code.");
      return;
    }
    if (isStaff && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      toast.error("Enter a valid staff email address.");
      return;
    }
    if (!password) {
      toast.error("Enter your password.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: isStaff ? normalizedEmail : `${normalizedCode}@student.local`,
      password,
    });
    if (error) {
      toast.error(
        isStaff
          ? "Staff email or password is incorrect."
          : "Student code or password is incorrect.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hero px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-card">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={toggleLocale}
            className="rounded-md border px-3 py-1 text-sm"
          >
            {locale === "en" ? "العربية" : "English"}
          </button>
        </div>
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            BTEC Assessment Portal
          </p>
          <h1 className="mt-3 text-3xl font-bold">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isStaff
              ? "Sign in with your Engineer or Unit Leader account."
              : "Sign in with your student code."}
          </p>
        </div>
        <form onSubmit={signIn} className="mt-8 space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setIsStaff(false)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${!isStaff ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            >
              Student
            </button>
            <button
              type="button"
              onClick={() => setIsStaff(true)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${isStaff ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            >
              Staff
            </button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-identifier">{isStaff ? "Staff email" : "Student code"}</Label>
            <Input
              id="login-identifier"
              inputMode={isStaff ? "email" : "numeric"}
              autoComplete="username"
              maxLength={isStaff ? 254 : 8}
              placeholder={isStaff ? "name@school.edu" : "e.g. 01090680"}
              value={isStaff ? email : code}
              onChange={(event) =>
                isStaff
                  ? setEmail(event.target.value)
                  : setCode(event.target.value.replace(/\D/g, ""))
              }
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
