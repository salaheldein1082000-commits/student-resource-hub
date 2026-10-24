import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil, Plus, Save, Search, UserRoundX, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/AppShell";
import { meQuery, useMe } from "@/lib/auth";
import { useLocale } from "@/lib/locale";
import { portalClassesQuery, portalDb, portalStudentsQuery } from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/students")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me || (me.role !== "unit_leader" && me.role !== "engineer")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "My Students — Unit 1 IT Infrastructure" },
      {
        name: "description",
        content: "View the student roster for classes assigned to you.",
      },
    ],
  }),
  component: StudentRosterPage,
});

function StudentRosterPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { direction, locale, t } = useLocale();
  const classesQuery = useQuery(portalClassesQuery);
  const studentsQuery = useQuery(portalStudentsQuery(me?.id ?? null));
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editClassId, setEditClassId] = useState("");
  const [editStudentCode, setEditStudentCode] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentCode, setNewStudentCode] = useState("");
  const [newStudentClassId, setNewStudentClassId] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string;
    code: string;
    className: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const classes = classesQuery.data;
  const assignedClasses = useMemo(
    () =>
      (classes ?? []).filter((classRow) =>
        me?.role === "unit_leader" ? true : classRow.engineer_id === me?.id,
      ),
    [classes, me?.id, me?.role],
  );
  const assignedClassIds = useMemo(
    () => new Set(assignedClasses.map((classRow) => classRow.id)),
    [assignedClasses],
  );
  const classById = useMemo(
    () => new Map(assignedClasses.map((classRow) => [classRow.id, classRow.name])),
    [assignedClasses],
  );
  const students = studentsQuery.data;
  const roster = useMemo(
    () =>
      (students ?? [])
        .filter(
          (student) =>
            (student.class_id && assignedClassIds.has(student.class_id)) ||
            (me?.role === "unit_leader" && !student.class_id),
        )
        .filter(
          (student) =>
            classFilter === "all" ||
            student.class_id === classFilter ||
            (me?.role === "unit_leader" && !student.class_id && classFilter === "unassigned"),
        )
        .filter((student) => {
          const needle = search.trim().toLocaleLowerCase(locale);
          if (!needle) return true;
          const className = student.class_id ? (classById.get(student.class_id) ?? "") : "";
          return [student.full_name ?? "", className, student.group_name ?? ""].some((value) =>
            value.toLocaleLowerCase(locale).includes(needle),
          );
        })
        .sort((left, right) => (left.full_name ?? "").localeCompare(right.full_name ?? "", locale)),
    [assignedClassIds, classById, classFilter, locale, me?.role, search, students],
  );
  const totalStudents = (students ?? []).filter(
    (student) =>
      (student.class_id && assignedClassIds.has(student.class_id)) ||
      (me?.role === "unit_leader" && !student.class_id),
  ).length;
  const isLoading = classesQuery.isLoading || studentsQuery.isLoading;
  const hasError = classesQuery.isError || studentsQuery.isError;

  async function saveStudent(studentId: string) {
    if (me?.role !== "unit_leader") return;
    if (editName.trim().length < 2 || editName.trim().length > 120) {
      toast.error("Student name must be between 2 and 120 characters.");
      return;
    }
    const selectedClass = assignedClasses.find((classRow) => classRow.id === editClassId);
    if (editClassId && !selectedClass) {
      toast.error("Choose a valid class.");
      return;
    }
    const studentCode = editStudentCode.trim();
    if (studentCode && !/^\d{6}$/.test(studentCode)) {
      toast.error("Student code must contain exactly 6 digits.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await portalDb.rpc("update_student_profile_and_login", {
        _profile_id: studentId,
        _full_name: editName.trim(),
        _class_id: selectedClass?.id ?? null,
        _student_code: studentCode || null,
      });
      if (error) throw error;
      toast.success(
        studentCode
          ? "Student profile updated; the new code is also the password."
          : "Student profile updated.",
      );
      setEditingId(null);
      setEditStudentCode("");
      await queryClient.invalidateQueries({ queryKey: ["portal", "students"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update student profile.");
    } finally {
      setBusy(false);
    }
  }

  async function createStudent() {
    if (me?.role !== "unit_leader") return;
    const name = newStudentName.trim();
    const code = newStudentCode.trim();
    const selectedClass = assignedClasses.find((classRow) => classRow.id === newStudentClassId);
    if (name.length < 2 || name.length > 120) {
      toast.error(t("studentNameValidation"));
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      toast.error(t("studentCodeValidation"));
      return;
    }
    if (!selectedClass) {
      toast.error(t("chooseClass"));
      return;
    }
    setBusy(true);
    try {
      const { error } = await portalDb.rpc("create_student", {
        _class_id: selectedClass.id,
        _student_code: code,
        _full_name: name,
      });
      if (error) throw error;
      setCreatedCredentials({ name, code, className: selectedClass.name });
      setNewStudentName("");
      setNewStudentCode("");
      toast.success(t("studentCreated"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["portal", "students"] }),
        queryClient.invalidateQueries({ queryKey: ["portal", "classes"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("studentCreateError"));
    } finally {
      setBusy(false);
    }
  }

  async function removeFromClass(studentId: string, studentName: string | null) {
    if (me?.role !== "unit_leader") return;
    if (
      !window.confirm(
        `Remove ${studentName || "this student"} from their class? Their login and submission history will be kept.`,
      )
    )
      return;
    setBusy(true);
    try {
      const { error } = await portalDb
        .from("profiles")
        .update({ class_id: null, group_name: null })
        .eq("id", studentId)
        .eq("role", "student");
      if (error) throw error;
      toast.success("Student removed from the class; account and history were preserved.");
      await queryClient.invalidateQueries({ queryKey: ["portal", "students"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove student from class.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl" dir={direction}>
      <PageHeader
        title={me?.role === "engineer" ? t("myStudents") : t("studentRoster")}
        sub={me?.role === "engineer" ? t("studentsInYourClasses") : t("studentsAcrossClasses")}
      />

      {me?.role === "unit_leader" && (
        <div className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <span>Manage student profiles without deleting accounts or assessment history.</span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setShowCreateForm((open) => !open);
                setCreatedCredentials(null);
              }}
            >
              <Plus className="me-2 h-4 w-4" /> {t("addStudent")}
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/manage/import">{t("importStudents")}</Link>
            </Button>
          </div>
        </div>
      )}

      {me?.role === "unit_leader" && showCreateForm && (
        <section
          className="my-4 rounded-xl border bg-card p-4 shadow-card"
          aria-labelledby="add-student-heading"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id="add-student-heading" className="text-base font-semibold">
                {t("addStudent")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("studentCredentialsHelp")}</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("cancel")}
              onClick={() => setShowCreateForm(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-xs text-muted-foreground">
              {t("studentName")}
              <Input
                value={newStudentName}
                maxLength={120}
                onChange={(event) => setNewStudentName(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              {t("studentCode")}
              <Input
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={newStudentCode}
                onChange={(event) =>
                  setNewStudentCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              {t("class")}
              <select
                value={newStudentClassId}
                onChange={(event) => setNewStudentClassId(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{t("chooseClass")}</option>
                {assignedClasses.map((classRow) => (
                  <option key={classRow.id} value={classRow.id}>
                    {classRow.name} · {t("enrollment")}{" "}
                    {students?.filter((student) => student.class_id === classRow.id).length ?? 0}/
                    {classRow.capacity}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              {t("initialPassword")}
              <Input
                type="password"
                readOnly
                value={newStudentCode}
                placeholder={t("passwordMatchesCode")}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t("studentCapacityAndDuplicateNotice")}
            </p>
            <Button disabled={busy || classesQuery.isLoading} onClick={() => void createStudent()}>
              {busy ? t("savingStudent") : t("createStudent")}
            </Button>
          </div>
          {createdCredentials && (
            <div
              className="mt-4 rounded-lg border border-emerald-600/30 bg-emerald-500/5 p-3 text-sm"
              role="status"
            >
              <p className="font-semibold">{t("studentCreatedCredentials")}</p>
              <p className="mt-1">
                {createdCredentials.name} · {createdCredentials.className}
              </p>
              <p className="mt-1 font-mono">
                {t("studentCode")}: {createdCredentials.code} · {t("initialPassword")}:{" "}
                {createdCredentials.code}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t("shareCredentialsPrivately")}</p>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <p className="text-sm text-muted-foreground">{t("assignedClasses")}</p>
          <p className="mt-2 text-2xl font-bold">{assignedClasses.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <p className="text-sm text-muted-foreground">{t("students")}</p>
          <p className="mt-2 text-2xl font-bold">{totalStudents}</p>
        </div>
      </div>

      <div className="my-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("search")}
          <span className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchStudents")}
              className="h-10 w-full rounded-md border bg-background ps-10 pe-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </span>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("filterClass")}
          <select
            value={classFilter}
            onChange={(event) => setClassFilter(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">{t("all")}</option>
            {me?.role === "unit_leader" && <option value="unassigned">Unassigned</option>}
            {assignedClasses.map((classRow) => (
              <option key={classRow.id} value={classRow.id}>
                {classRow.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card shadow-card" aria-live="polite">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">{t("loading")}</p>
        ) : hasError ? (
          <p className="p-6 text-sm text-destructive" role="alert">
            {t("studentRosterError")}
          </p>
        ) : assignedClasses.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{t("noClassesAssigned")}</p>
        ) : roster.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{t("noStudentsFound")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="bg-muted/60 text-start text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">
                    {t("studentName")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">
                    {t("class")}
                  </th>
                  {me?.role === "unit_leader" && (
                    <th scope="col" className="px-4 py-3 text-end font-semibold">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {roster.map((student) => (
                  <tr key={student.id} className="border-t border-border/70">
                    {editingId === student.id ? (
                      <>
                        <td className="px-4 py-3">
                          <div className="space-y-2">
                            <Input
                              aria-label="Student name"
                              value={editName}
                              onChange={(event) => setEditName(event.target.value)}
                            />
                            <Input
                              aria-label="New 6-digit student code (optional)"
                              inputMode="numeric"
                              maxLength={6}
                              placeholder="New student code (optional)"
                              value={editStudentCode}
                              onChange={(event) =>
                                setEditStudentCode(
                                  event.target.value.replace(/\D/g, "").slice(0, 6),
                                )
                              }
                            />
                            <Input
                              aria-label="Password (same as student code)"
                              type="password"
                              readOnly
                              value={editStudentCode}
                              placeholder="Password will match the new code"
                            />
                            <p className="text-xs text-muted-foreground">
                              Leave the code blank to keep current credentials. If changed, the
                              password is reset to the same six-digit code.
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            aria-label="Student class"
                            value={editClassId}
                            onChange={(event) => setEditClassId(event.target.value)}
                            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          >
                            <option value="">Unassigned</option>
                            {assignedClasses.map((classRow) => (
                              <option key={classRow.id} value={classRow.id}>
                                {classRow.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-end">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              aria-label="Save student"
                              disabled={busy}
                              onClick={() => void saveStudent(student.id)}
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Cancel edit"
                              disabled={busy}
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium">
                          {student.full_name?.trim() || t("student")}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {student.class_id
                            ? (classById.get(student.class_id) ??
                              student.group_name ??
                              t("unassigned"))
                            : t("unassigned")}
                        </td>
                        {me?.role === "unit_leader" && (
                          <td className="px-4 py-3 text-end">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Edit student"
                                title="Edit"
                                disabled={busy}
                                onClick={() => {
                                  setEditingId(student.id);
                                  setEditName(student.full_name ?? "");
                                  setEditClassId(student.class_id ?? "");
                                  setEditStudentCode("");
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {student.class_id && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label="Remove student from class"
                                  title="Remove from class"
                                  disabled={busy}
                                  onClick={() =>
                                    void removeFromClass(student.id, student.full_name)
                                  }
                                >
                                  <UserRoundX className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
