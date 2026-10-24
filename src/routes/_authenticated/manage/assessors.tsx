import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { KeyRound, Pencil, Save, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/AppShell";
import { meQuery } from "@/lib/auth";
import { portalClassesQuery, portalDb, portalProfilesQuery } from "@/lib/portal";

const NO_CLASS = "__none__";

function createAssessorErrorMessage(error: unknown): string {
  const value =
    error && typeof error === "object" ? (error as { code?: unknown; message?: unknown }) : null;
  const code = typeof value?.code === "string" ? value.code : "";
  const message =
    typeof value?.message === "string"
      ? value.message
      : error instanceof Error
        ? error.message
        : "";
  if (
    code === "refresh_token_not_found" ||
    /refresh.?token.*(?:not found|invalid|expired)|invalid refresh token/i.test(
      `${code} ${message}`,
    )
  ) {
    return "Your sign-in session expired. Sign out and sign back in, then try creating the Assessor again.";
  }
  return message || "Could not create Assessor account.";
}

export const Route = createFileRoute("/_authenticated/manage/assessors")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me?.role !== "unit_leader") throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Assessors — BTEC Assessment Portal" },
      { name: "description", content: "Create Assessor accounts for the BTEC Assessment Portal." },
    ],
  }),
  component: AssessorsPage,
});

function AssessorsPage() {
  const queryClient = useQueryClient();
  const { data: classes = [], isLoading: classesLoading } = useQuery(portalClassesQuery);
  const { data: profiles = [] } = useQuery(portalProfilesQuery);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [classId, setClassId] = useState(NO_CLASS);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editClassIds, setEditClassIds] = useState<string[]>([]);
  const assessors = profiles.filter((profile) => profile.role === "engineer");

  async function createAssessor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (cleanName.length < 2 || cleanName.length > 120) {
      toast.error("Name must be between 2 and 120 characters.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error("Enter a valid email address.");
      return;
    }
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
      toast.error("Password must be at least 8 characters and no more than 72 bytes.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await portalDb.rpc("create_assessor", {
        _email: cleanEmail,
        _full_name: cleanName,
        _password: password,
        _class_id: classId === NO_CLASS ? null : classId,
      });
      if (error) throw error;
      toast.success(`Assessor account created for ${cleanName}.`);
      setFullName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setClassId(NO_CLASS);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: portalProfilesQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: portalClassesQuery.queryKey }),
      ]);
    } catch (error) {
      toast.error(createAssessorErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveAssessor(profileId: string) {
    const cleanName = editName.trim();
    const cleanEmail = editEmail.trim().toLowerCase();
    if (cleanName.length < 2 || cleanName.length > 120) {
      toast.error("Name must be between 2 and 120 characters.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error("Enter a valid email address.");
      return;
    }
    if (
      editPassword &&
      (editPassword.length < 8 || new TextEncoder().encode(editPassword).length > 72)
    ) {
      toast.error("A new password must be at least 8 characters and no more than 72 bytes.");
      return;
    }
    if (editClassIds.length > 2) {
      toast.error("An Assessor can be assigned to no more than two classes.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await portalDb.rpc("update_assessor_account", {
        _profile_id: profileId,
        _email: cleanEmail,
        _full_name: cleanName,
        _password: editPassword || null,
        _class_ids: editClassIds,
      });
      if (error) throw error;
      toast.success("Assessor account updated.");
      setEditingId(null);
      setEditPassword("");
      setEditClassIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: portalProfilesQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: portalClassesQuery.queryKey }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update Assessor account.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAssessor(profileId: string, name: string, assessorEmail: string) {
    if (
      !window.confirm(
        `Permanently delete ${name || assessorEmail}? Their portal account will be removed, their classes unassigned, and linked activity records may be removed. This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    try {
      const { error } = await portalDb.rpc("delete_assessor_account", { _profile_id: profileId });
      if (error) throw error;
      toast.success("Assessor account deleted.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: portalProfilesQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: portalClassesQuery.queryKey }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete Assessor account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Assessors"
        sub="Create staff accounts and assign an Assessor to a class."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Add an Assessor
            </CardTitle>
            <CardDescription>
              Enter the email and choose a password manually. The password is hashed by the database
              and is not displayed after creation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(event) => void createAssessor(event)}>
              <div className="space-y-2">
                <Label htmlFor="assessor-name">Full name</Label>
                <Input
                  id="assessor-name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assessor-email">Email address</Label>
                <Input
                  id="assessor-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={254}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assessor-password">Password</Label>
                <Input
                  id="assessor-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
                  maxLength={72}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assessor-confirm-password">Confirm password</Label>
                <Input
                  id="assessor-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={8}
                  maxLength={72}
                />
              </div>
              <div className="space-y-2">
                <Label>Assign to a class (optional)</Label>
                <Select value={classId} onValueChange={setClassId} disabled={classesLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CLASS}>No class yet</SelectItem>
                    {classes.map((item) => (
                      <SelectItem
                        key={item.id}
                        value={item.id}
                        disabled={Boolean(item.engineer_id)}
                      >
                        {item.name}
                        {item.engineer_id ? " · Assessor assigned" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                Choose a password at least 8 characters long. Only share it with the new Assessor
                through an appropriate channel.
              </p>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Creating account…" : "Create Assessor account"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Current Assessors</CardTitle>
            <CardDescription>
              {assessors.length} account{assessors.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {assessors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Assessor profiles found.</p>
            ) : (
              <ul className="divide-y">
                {assessors.map((assessor) => {
                  const assigned = classes
                    .filter((classRow) => classRow.engineer_id === assessor.id)
                    .map((classRow) => classRow.name);
                  return (
                    <li key={assessor.id} className="py-3 first:pt-0 last:pb-0">
                      {editingId === assessor.id ? (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label htmlFor={`assessor-edit-name-${assessor.id}`}>Full name</Label>
                            <Input
                              id={`assessor-edit-name-${assessor.id}`}
                              value={editName}
                              onChange={(event) => setEditName(event.target.value)}
                              maxLength={120}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`assessor-edit-email-${assessor.id}`}>
                              Email address
                            </Label>
                            <Input
                              id={`assessor-edit-email-${assessor.id}`}
                              type="email"
                              value={editEmail}
                              onChange={(event) => setEditEmail(event.target.value)}
                              maxLength={254}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`assessor-edit-password-${assessor.id}`}>
                              New password (optional)
                            </Label>
                            <Input
                              id={`assessor-edit-password-${assessor.id}`}
                              type="password"
                              autoComplete="new-password"
                              value={editPassword}
                              onChange={(event) => setEditPassword(event.target.value)}
                              minLength={8}
                              maxLength={72}
                              placeholder="Leave blank to keep current"
                            />
                          </div>
                          <fieldset className="space-y-2">
                            <legend className="text-sm font-medium">
                              Assigned classes (up to two)
                            </legend>
                            {classes.map((classRow) => {
                              const assignedToOther = Boolean(
                                classRow.engineer_id && classRow.engineer_id !== assessor.id,
                              );
                              const checked = editClassIds.includes(classRow.id);
                              return (
                                <label
                                  key={classRow.id}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={busy || (assignedToOther && !checked)}
                                    onChange={(event) => {
                                      if (event.target.checked) {
                                        if (editClassIds.length >= 2) {
                                          toast.error(
                                            "An Assessor can be assigned to no more than two classes.",
                                          );
                                          return;
                                        }
                                        setEditClassIds([...editClassIds, classRow.id]);
                                      } else {
                                        setEditClassIds(
                                          editClassIds.filter((id) => id !== classRow.id),
                                        );
                                      }
                                    }}
                                  />
                                  <span>
                                    {classRow.name}
                                    {assignedToOther ? " · assigned to another Assessor" : ""}
                                  </span>
                                </label>
                              );
                            })}
                          </fieldset>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => void saveAssessor(assessor.id)}
                              disabled={busy}
                            >
                              <Save className="mr-1 h-4 w-4" />
                              Save changes
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setEditingId(null);
                                setEditPassword("");
                                setEditClassIds([]);
                              }}
                            >
                              <X className="mr-1 h-4 w-4" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="font-medium">{assessor.full_name || "Unnamed Assessor"}</p>
                          <p className="text-sm text-muted-foreground">
                            {assessor.email || "No email on profile"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {assigned.length ? assigned.join(", ") : "No classes assigned"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setEditingId(assessor.id);
                                setEditName(assessor.full_name ?? "");
                                setEditEmail(assessor.email ?? "");
                                setEditPassword("");
                                setEditClassIds(
                                  classes
                                    .filter((classRow) => classRow.engineer_id === assessor.id)
                                    .map((classRow) => classRow.id),
                                );
                              }}
                            >
                              <Pencil className="mr-1 h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={busy}
                              onClick={() =>
                                void deleteAssessor(
                                  assessor.id,
                                  assessor.full_name ?? "Assessor",
                                  assessor.email ?? "this account",
                                )
                              }
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
