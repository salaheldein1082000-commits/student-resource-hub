import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
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
import {
  portalClassesQuery,
  portalDb,
  portalProfilesQuery,
  type PortalClass,
  type PortalProfile,
} from "@/lib/portal";

const UNASSIGNED_VALUE = "__unassigned__";
const NO_CLASS_VALUE = "__no_class__";
const SEEDED_CLASS_NAMES = Array.from(
  { length: 12 },
  (_, index) => `Class ${String(index + 1).padStart(2, "0")}`,
);

type Credentials = { email: string; fullName: string; temporaryPassword: string };

export const Route = createFileRoute("/_authenticated/manage/classes")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: "/dashboard" });

    const { data: profile } = await portalDb
      .from("profiles")
      .select("role")
      .eq("id", me.id)
      .maybeSingle();
    if (profile?.role !== "unit_leader") throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Classes — Unit 1 IT Infrastructure" },
      { name: "description", content: "Manage BTEC classes, Assessors, and enrolment capacity." },
    ],
  }),
  component: ClassesPage,
});

function ClassesPage() {
  const queryClient = useQueryClient();
  const classesQuery = useQuery(portalClassesQuery);
  const profilesQuery = useQuery(portalProfilesQuery);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingCapacityClassId, setEditingCapacityClassId] = useState<string | null>(null);
  const [editingCapacity, setEditingCapacity] = useState("");
  const [mutatingKey, setMutatingKey] = useState<string | null>(null);
  const [createClassName, setCreateClassName] = useState("");
  const [createClassCapacity, setCreateClassCapacity] = useState("20");
  const [createEmail, setCreateEmail] = useState("");
  const [createFullName, setCreateFullName] = useState("");
  const [createClassId, setCreateClassId] = useState(NO_CLASS_VALUE);
  const [promoteProfileId, setPromoteProfileId] = useState("");
  const [promoteClassId, setPromoteClassId] = useState(NO_CLASS_VALUE);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const classes = classesQuery.data ?? [];
  const profiles = profilesQuery.data ?? [];
  const displayClasses = [...classes].sort((left, right) => left.name.localeCompare(right.name));
  const engineers = profiles.filter((profile) => profile.role === "engineer");
  const eligibleProfiles = profiles.filter((profile) => profile.role === "student");
  const engineerAssignments = new Map<string, number>();

  for (const classRow of classes) {
    if (classRow.engineer_id) {
      engineerAssignments.set(
        classRow.engineer_id,
        (engineerAssignments.get(classRow.engineer_id) ?? 0) + 1,
      );
    }
  }

  const invalidatePortal = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: portalClassesQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: portalProfilesQuery.queryKey }),
    ]);
  };

  const withMutation = async (key: string, action: () => Promise<void>) => {
    setMutatingKey(key);
    try {
      await action();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setMutatingKey(null);
    }
  };

  const createClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = createClassName.trim();
    const capacity = Number(createClassCapacity);
    if (name.length < 2 || name.length > 80) {
      toast.error("Class name must be between 2 and 80 characters.");
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
      toast.error("Capacity must be a whole number from 1 to 500.");
      return;
    }
    await withMutation("create-class", async () => {
      const { error } = await portalDb.rpc("create_class", {
        _name: name,
        _capacity: capacity,
      });
      if (error) throw error;
      setCreateClassName("");
      setCreateClassCapacity("20");
      await queryClient.invalidateQueries({ queryKey: portalClassesQuery.queryKey });
      toast.success("Class created.");
    });
  };

  const saveCapacity = async (classRow: PortalClass) => {
    const capacity = Number(editingCapacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
      toast.error("Capacity must be a whole number from 1 to 500.");
      return;
    }
    await withMutation(`capacity-${classRow.id}`, async () => {
      const { error } = await portalDb.rpc("update_class_capacity", {
        _class_id: classRow.id,
        _capacity: capacity,
      });
      if (error) throw error;
      setEditingCapacityClassId(null);
      setEditingCapacity("");
      await queryClient.invalidateQueries({ queryKey: portalClassesQuery.queryKey });
      toast.success("Class capacity updated.");
    });
  };

  const deleteClass = async (classRow: PortalClass, targetClassId: string | null) => {
    const target = classes.find((candidate) => candidate.id === targetClassId);
    const detail = target
      ? ` Students and their assignment access will move to ${target.name}; submission history is preserved.`
      : " This only works when the class has no students or Drive upload history.";
    if (
      !window.confirm(
        `Delete ${classRow.name}?${detail} The class's Assessor and folder mapping will be removed; the Drive folder and student accounts will not be deleted.`,
      )
    )
      return;

    await withMutation(`delete-${classRow.id}`, async () => {
      const { error } = await portalDb.rpc("delete_class_with_transfer", {
        _class_id: classRow.id,
        _target_class_id: targetClassId,
      });
      if (error) throw error;
      setEditingClassId(null);
      setEditingCapacityClassId(null);
      await invalidatePortal();
      toast.success(`${classRow.name} deleted.`);
    });
  };

  const renameClass = async (classRow: PortalClass) => {
    const name = editingName.trim();
    if (!name) {
      toast.error("Enter a class name.");
      return;
    }
    await withMutation(`rename-${classRow.id}`, async () => {
      const { error } = await portalDb.from("classes").update({ name }).eq("id", classRow.id);
      if (error) throw error;
      setEditingClassId(null);
      setEditingName("");
      await queryClient.invalidateQueries({ queryKey: portalClassesQuery.queryKey });
      toast.success("Class name updated.");
    });
  };

  const assignAssessor = async (classRow: PortalClass, engineerId: string) => {
    await withMutation(`assign-${classRow.id}`, async () => {
      if (engineerId === UNASSIGNED_VALUE) {
        const { error } = await portalDb
          .from("class_engineers")
          .delete()
          .eq("class_id", classRow.id);
        if (error) throw error;
        toast.success("Assessor unassigned.");
      } else {
        const { error } = await portalDb
          .from("class_engineers")
          .upsert({ class_id: classRow.id, engineer_id: engineerId }, { onConflict: "class_id" });
        if (error) throw error;
        toast.success("Assessor assigned.");
      }
      await queryClient.invalidateQueries({ queryKey: portalClassesQuery.queryKey });
    });
  };

  const createAssessor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = createEmail.trim();
    const fullName = createFullName.trim();
    if (!email || !fullName) {
      toast.error("Enter the Assessor's full name and email.");
      return;
    }

    await withMutation("create-engineer", async () => {
      const { data, error } = await portalDb.rpc("create_engineer", {
        _email: email,
        _full_name: fullName,
      });
      if (error) throw error;
      const created = Array.isArray(data) ? data[0] : data;
      if (!created?.user_id || !created?.temporary_password)
        throw new Error("Assessor account creation returned no credentials.");

      let assignmentError: { message: string } | null = null;
      if (createClassId !== NO_CLASS_VALUE) {
        const assignment = await portalDb.from("class_engineers").insert({
          class_id: createClassId,
          engineer_id: created.user_id,
        });
        assignmentError = assignment.error;
      }

      setCredentials({
        email: created.email ?? email,
        fullName,
        temporaryPassword: created.temporary_password,
      });
      setCreateEmail("");
      setCreateFullName("");
      setCreateClassId(NO_CLASS_VALUE);
      await invalidatePortal();
      toast.success(
        assignmentError
          ? "Assessor created, but class assignment needs attention."
          : "Assessor account created.",
      );
      if (assignmentError) toast.error(assignmentError.message);
    });
  };

  const promoteAssessor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!promoteProfileId) {
      toast.error("Choose an existing profile to promote.");
      return;
    }

    await withMutation("promote-engineer", async () => {
      const { error } = await portalDb.rpc("set_portal_role", {
        _profile_id: promoteProfileId,
        _role: "engineer",
      });
      if (error) throw error;

      let assignmentError: { message: string } | null = null;
      if (promoteClassId !== NO_CLASS_VALUE) {
        const assignment = await portalDb.from("class_engineers").insert({
          class_id: promoteClassId,
          engineer_id: promoteProfileId,
        });
        assignmentError = assignment.error;
      }

      setPromoteProfileId("");
      setPromoteClassId(NO_CLASS_VALUE);
      await invalidatePortal();
      toast.success(
        assignmentError
          ? "Profile promoted, but class assignment needs attention."
          : "Profile promoted to Assessor.",
      );
      if (assignmentError) toast.error(assignmentError.message);
    });
  };

  const isLoading = classesQuery.isPending || profilesQuery.isPending;
  const queryError = classesQuery.error ?? profilesQuery.error;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Classes"
        sub="Create and manage classes, set student capacity, and keep Assessor access class-scoped."
      >
        <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" /> Unit Leader admin
        </div>
      </PageHeader>

      {queryError && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold">Classes could not be loaded</p>
            <p className="mt-1 text-muted-foreground">{errorMessage(queryError)}</p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => void invalidatePortal()}
            >
              <RefreshCw className="h-4 w-4" /> Try again
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Add a class
              </CardTitle>
              <CardDescription>
                Choose a unique name and set the maximum number of enrolled students (1–500).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto]"
                onSubmit={createClass}
              >
                <div className="space-y-2">
                  <Label htmlFor="new-class-name">Class name</Label>
                  <Input
                    id="new-class-name"
                    value={createClassName}
                    onChange={(event) => setCreateClassName(event.target.value)}
                    maxLength={80}
                    placeholder="Class 42"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-class-capacity">Student capacity</Label>
                  <Input
                    id="new-class-capacity"
                    type="number"
                    min={1}
                    max={500}
                    step={1}
                    value={createClassCapacity}
                    onChange={(event) => setCreateClassCapacity(event.target.value)}
                    required
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={mutatingKey === "create-class"}>
                    <Plus className="h-4 w-4" />
                    {mutatingKey === "create-class" ? "Creating…" : "Create class"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {displayClasses.map((classRow) => {
              const enrolled = profiles.filter(
                (profile) => profile.role === "student" && profile.class_id === classRow.id,
              ).length;
              return (
                <ClassCard
                  key={classRow.id}
                  classRow={classRow}
                  enrolled={enrolled}
                  otherClasses={classes.filter((candidate) => candidate.id !== classRow.id)}
                  engineer={
                    classRow.engineer_id
                      ? profiles.find((profile) => profile.id === classRow.engineer_id)
                      : undefined
                  }
                  engineers={engineers}
                  engineerAssignments={engineerAssignments}
                  editing={editingClassId === classRow.id}
                  editingName={editingClassId === classRow.id ? editingName : classRow.name}
                  capacityEditing={editingCapacityClassId === classRow.id}
                  editingCapacity={
                    editingCapacityClassId === classRow.id
                      ? editingCapacity
                      : String(classRow.capacity)
                  }
                  busy={
                    mutatingKey === `rename-${classRow.id}` ||
                    mutatingKey === `assign-${classRow.id}` ||
                    mutatingKey === `capacity-${classRow.id}` ||
                    mutatingKey === `delete-${classRow.id}`
                  }
                  onStartRename={() => {
                    setEditingCapacityClassId(null);
                    setEditingCapacity("");
                    setEditingClassId(classRow.id);
                    setEditingName(classRow.name);
                  }}
                  onEditingNameChange={setEditingName}
                  onCancelRename={() => {
                    setEditingClassId(null);
                    setEditingName("");
                  }}
                  onSaveRename={() => void renameClass(classRow)}
                  onStartCapacityEdit={() => {
                    setEditingClassId(null);
                    setEditingName("");
                    setEditingCapacityClassId(classRow.id);
                    setEditingCapacity(String(classRow.capacity));
                  }}
                  onEditingCapacityChange={setEditingCapacity}
                  onCancelCapacityEdit={() => {
                    setEditingCapacityClassId(null);
                    setEditingCapacity("");
                  }}
                  onSaveCapacity={() => void saveCapacity(classRow)}
                  onAssign={(engineerId) => void assignAssessor(classRow, engineerId)}
                  onDelete={(targetClassId) => void deleteClass(classRow, targetClassId)}
                />
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" /> Create an Assessor
                </CardTitle>
                <CardDescription>
                  Create a staff login and optionally assign it to one class immediately.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={createAssessor}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="engineer-name">Full name</Label>
                      <Input
                        id="engineer-name"
                        value={createFullName}
                        onChange={(event) => setCreateFullName(event.target.value)}
                        placeholder="Alex Morgan"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="engineer-email">Email address</Label>
                      <Input
                        id="engineer-email"
                        type="email"
                        value={createEmail}
                        onChange={(event) => setCreateEmail(event.target.value)}
                        placeholder="alex@example.com"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Assign to a class{" "}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <ClassSelect
                      value={createClassId}
                      onChange={setCreateClassId}
                      classes={classes}
                      placeholder="No class yet"
                    />
                  </div>
                  <Button type="submit" disabled={mutatingKey === "create-engineer"}>
                    <Plus className="h-4 w-4" />{" "}
                    {mutatingKey === "create-engineer" ? "Creating…" : "Create Assessor"}
                  </Button>
                </form>

                {credentials && (
                  <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 font-semibold">
                          <KeyRound className="h-4 w-4 text-primary" /> One-time temporary password
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          Share this securely with {credentials.fullName}. It will not be shown
                          again after dismissal.
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Dismiss temporary password"
                        onClick={() => setCredentials(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="mt-3 break-all rounded-md bg-background px-3 py-2 font-mono text-sm">
                      {credentials.temporaryPassword}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">Login: {credentials.email}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" /> Promote an existing profile
                </CardTitle>
                <CardDescription>
                  Only student profiles are offered here; existing Assessors and Unit Leaders
                  already have staff roles.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {eligibleProfiles.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No eligible student profiles are available to promote.
                  </div>
                ) : (
                  <form className="space-y-4" onSubmit={promoteAssessor}>
                    <div className="space-y-2">
                      <Label>Existing profile</Label>
                      <Select value={promoteProfileId} onValueChange={setPromoteProfileId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a profile" />
                        </SelectTrigger>
                        <SelectContent>
                          {eligibleProfiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profileLabel(profile)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Assign to a class{" "}
                        <span className="font-normal text-muted-foreground">(optional)</span>
                      </Label>
                      <ClassSelect
                        value={promoteClassId}
                        onChange={setPromoteClassId}
                        classes={classes}
                        placeholder="No class yet"
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={mutatingKey === "promote-engineer"}
                    >
                      <ShieldCheck className="h-4 w-4" />{" "}
                      {mutatingKey === "promote-engineer" ? "Promoting…" : "Promote to Assessor"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            <Users className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <span className="font-semibold text-foreground">Access rule:</span> each class has one
              Assessor, and an Assessor may be assigned to no more than two classes. The database
              enforces both role and assignment limits.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function ClassCard({
  classRow,
  enrolled,
  otherClasses,
  engineer,
  engineers,
  engineerAssignments,
  editing,
  editingName,
  capacityEditing,
  editingCapacity,
  busy,
  onStartRename,
  onEditingNameChange,
  onCancelRename,
  onSaveRename,
  onStartCapacityEdit,
  onEditingCapacityChange,
  onCancelCapacityEdit,
  onSaveCapacity,
  onAssign,
  onDelete,
}: {
  classRow: PortalClass;
  enrolled: number;
  otherClasses: PortalClass[];
  engineer: PortalProfile | undefined;
  engineers: PortalProfile[];
  engineerAssignments: Map<string, number>;
  editing: boolean;
  editingName: string;
  capacityEditing: boolean;
  editingCapacity: string;
  busy: boolean;
  onStartRename: () => void;
  onEditingNameChange: (value: string) => void;
  onCancelRename: () => void;
  onSaveRename: () => void;
  onStartCapacityEdit: () => void;
  onEditingCapacityChange: (value: string) => void;
  onCancelCapacityEdit: () => void;
  onSaveCapacity: () => void;
  onAssign: (engineerId: string) => void;
  onDelete: (targetClassId: string | null) => void;
}) {
  const assignedId = classRow.engineer_id ?? UNASSIGNED_VALUE;
  const [deletePanelOpen, setDeletePanelOpen] = useState(false);
  const [targetClassId, setTargetClassId] = useState("");
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={editingName}
                  onChange={(event) => onEditingNameChange(event.target.value)}
                  aria-label={`Rename ${classRow.name}`}
                />
                <Button
                  size="icon"
                  aria-label="Save class name"
                  disabled={busy}
                  onClick={onSaveRename}
                >
                  <Save className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Cancel rename"
                  disabled={busy}
                  onClick={onCancelRename}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <CardTitle className="flex items-center gap-2 text-lg">
                {classRow.name}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label={`Rename ${classRow.name}`}
                  onClick={onStartRename}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </CardTitle>
            )}
            <CardDescription className="mt-2 flex items-center gap-2">
              <Users className="h-4 w-4" /> {enrolled} / {classRow.capacity} enrolled
            </CardDescription>
          </div>
          {capacityEditing ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={enrolled}
                max={500}
                step={1}
                className="w-24"
                value={editingCapacity}
                aria-label={`Student capacity for ${classRow.name}`}
                onChange={(event) => onEditingCapacityChange(event.target.value)}
              />
              <Button
                size="icon"
                aria-label="Save capacity"
                disabled={busy}
                onClick={onSaveCapacity}
              >
                <Save className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Cancel capacity change"
                disabled={busy}
                onClick={onCancelCapacityEdit}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs text-muted-foreground">
              <span>{classRow.capacity} seats</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                aria-label={`Edit capacity for ${classRow.name}`}
                onClick={onStartCapacityEdit}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Assigned Assessor
          </p>
          <p className="mt-1 truncate text-sm font-medium">
            {engineer ? profileLabel(engineer) : "Not assigned"}
          </p>
        </div>
        <Select value={assignedId} onValueChange={onAssign} disabled={busy}>
          <SelectTrigger aria-label={`Assign Assessor to ${classRow.name}`}>
            <SelectValue placeholder="Choose an Assessor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED_VALUE}>No Assessor assigned</SelectItem>
            {engineers.map((candidate) => {
              const atLimit =
                (engineerAssignments.get(candidate.id) ?? 0) >= 2 &&
                candidate.id !== classRow.engineer_id;
              return (
                <SelectItem key={candidate.id} value={candidate.id} disabled={atLimit}>
                  {profileLabel(candidate)}
                  {atLimit ? " (2 classes)" : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            Student capacity: {enrolled}/{classRow.capacity}
          </span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setDeletePanelOpen((open) => !open)}
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>

        {deletePanelOpen && (
          <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Student accounts and submissions are preserved. If students or Drive upload history
              exist, choose a destination class; student assignment access will move with them.
              Active uploads must finish first. Ensure the destination has a private Drive folder
              mapped for future submissions. The class's Assessor/folder mapping is removed, but the
              Drive folder itself is not deleted.
            </p>
            <label className="block space-y-1 text-xs text-muted-foreground">
              Destination class (required if student or Drive upload history exists):
              <select
                value={targetClassId}
                onChange={(event) => setTargetClassId(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"
              >
                <option value="">No destination class</option>
                {otherClasses.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.capacity} seats)
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setDeletePanelOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => onDelete(targetClassId || null)}
              >
                Confirm delete
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClassSelect({
  value,
  onChange,
  classes,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  classes: PortalClass[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_CLASS_VALUE}>{placeholder}</SelectItem>
        {classes.map((classRow) => (
          <SelectItem key={classRow.id} value={classRow.id}>
            {classRow.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function profileLabel(profile: PortalProfile) {
  return profile.full_name?.trim() || profile.email || "Unnamed profile";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function LoadingState() {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading classes and profiles…
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SEEDED_CLASS_NAMES.slice(0, 6).map((name) => (
          <div key={name} className="h-48 animate-pulse rounded-xl border bg-muted/30" />
        ))}
      </div>
    </div>
  );
}
