import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { meQuery, useMe } from "@/lib/auth";
import { useLocale } from "@/lib/locale";
import { portalClassesQuery, portalStudentsQuery } from "@/lib/portal";

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
  const { data: me } = useMe();
  const { direction, locale, t } = useLocale();
  const classesQuery = useQuery(portalClassesQuery);
  const studentsQuery = useQuery(portalStudentsQuery(me?.id ?? null));
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");

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
        .filter((student) => student.class_id && assignedClassIds.has(student.class_id))
        .filter((student) => classFilter === "all" || student.class_id === classFilter)
        .filter((student) => {
          const needle = search.trim().toLocaleLowerCase(locale);
          if (!needle) return true;
          const className = student.class_id ? (classById.get(student.class_id) ?? "") : "";
          return [student.full_name ?? "", className, student.group_name ?? ""].some((value) =>
            value.toLocaleLowerCase(locale).includes(needle),
          );
        })
        .sort((left, right) => (left.full_name ?? "").localeCompare(right.full_name ?? "", locale)),
    [assignedClassIds, classById, classFilter, locale, search, students],
  );
  const totalStudents = (students ?? []).filter(
    (student) => student.class_id && assignedClassIds.has(student.class_id),
  ).length;
  const isLoading = classesQuery.isLoading || studentsQuery.isLoading;
  const hasError = classesQuery.isError || studentsQuery.isError;

  return (
    <div className="mx-auto max-w-6xl" dir={direction}>
      <PageHeader
        title={me?.role === "engineer" ? t("myStudents") : t("studentRoster")}
        sub={me?.role === "engineer" ? t("studentsInYourClasses") : t("studentsAcrossClasses")}
      />

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
                </tr>
              </thead>
              <tbody>
                {roster.map((student) => (
                  <tr key={student.id} className="border-t border-border/70">
                    <td className="px-4 py-3 font-medium">
                      {student.full_name?.trim() || t("student")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {student.class_id
                        ? (classById.get(student.class_id) ?? student.group_name ?? t("unassigned"))
                        : t("unassigned")}
                    </td>
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
