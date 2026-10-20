import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { needsInitialPasswordChange } from "@/lib/studentCode";
import { portalDb } from "@/lib/portal";

export const Route = createFileRoute("/change-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Change your password — BTEC Assessment Portal" },
      { name: "description", content: "Set a private password before using the student portal." },
    ],
  }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    if (!needsInitialPasswordChange(data.user.app_metadata)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 12) {
      toast.error("Choose a password with at least 12 characters.");
      return;
    }
    if (password !== confirmation) {
      toast.error("The passwords do not match.");
      return;
    }

    setBusy(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      toast.error("Your session expired. Please sign in again.");
      setBusy(false);
      await supabase.auth.signOut();
      await navigate({ to: "/auth", replace: true });
      return;
    }
    const studentCode = userData.user.email?.match(/^([0-9]{6})@student\.local$/)?.[1];
    if (studentCode && password === studentCode) {
      toast.error("Your new password must be different from your student code.");
      setBusy(false);
      return;
    }

    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      toast.error(passwordError.message || "Could not update your password.");
      setBusy(false);
      return;
    }

    const { error: completionError } = await portalDb.rpc("complete_initial_password_change");
    if (completionError) {
      toast.error(
        completionError.message || "Your password was changed, but setup is not complete yet.",
      );
      setBusy(false);
      return;
    }

    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      toast.success("Password changed. Please sign in again with your new password.");
      await supabase.auth.signOut();
      await navigate({ to: "/auth", replace: true });
      return;
    }

    toast.success("Password updated. You can now use the portal.");
    await navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hero px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-card">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
          BTEC Assessment Portal
        </p>
        <h1 className="mt-3 text-2xl font-bold">Set your private password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your initial password was your six-digit student code. Choose a new password before
          opening the portal.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Use at least 12 characters and do not reuse your student code.
          </p>
          <Button type="submit" disabled={busy} size="lg" className="w-full">
            {busy ? "Updating password…" : "Save new password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
