import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/AppShell";
import { meQuery } from "@/lib/auth";
import { useLocale } from "@/lib/locale";
import {
  portalAssignmentsQuery,
  portalClassesQuery,
  portalDb,
  type PortalAssignment,
  type PortalCriterion,
} from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/manage/assignments")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me?.role !== "unit_leader") throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "Assignments — Unit 1 IT Infrastructure" }] }),
  component: Assignments,
});

type CriterionTemplate = PortalCriterion & { unit_no: number; learning_aim: string };

function Assignments() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const { data: assignments = [], isLoading } = useQuery(portalAssignmentsQuery);
  const { data: classes = [] } = useQuery(portalClassesQuery);
  const { data: templates = [] } = useQuery({
    queryKey: ["portal", "criterion-templates"],
    queryFn: async (): Promise<CriterionTemplate[]> => {
      const { data, error } = await portalDb.from("criteria").select("*").order("sort_order");
      if (error) throw error;
      const unique = new Map<string, CriterionTemplate>();
      for (const item of data ?? [])
        if (!unique.has(item.code)) unique.set(item.code, item as CriterionTemplate);
      return [...unique.values()];
    },
  });

  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [part, setPart] = useState("1");
  const [totalParts, setTotalParts] = useState("1");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [briefFile, setBriefFile] = useState<File | null>(null);
  const [published, setPublished] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["portal", "assignments"] });
  };

  function toggleValue(value: string, list: string[], setList: (next: string[]) => void) {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  async function addAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numberPart = Number(part);
    const numberParts = Number(totalParts);
    if (!title.trim() || selectedCodes.length === 0 || selectedClasses.length === 0) {
      toast.error("Add a title, choose at least one criterion, and assign at least one class.");
      return;
    }
    if (
      !Number.isInteger(numberPart) ||
      !Number.isInteger(numberParts) ||
      numberPart < 1 ||
      numberParts < 1 ||
      numberPart > numberParts
    ) {
      toast.error("Part must be a whole number between 1 and total parts.");
      return;
    }
    if (
      briefFile &&
      (!briefFile.name.toLowerCase().endsWith(".pdf") ||
        (briefFile.type && briefFile.type !== "application/pdf"))
    ) {
      toast.error("Assignment briefs must be PDF files.");
      return;
    }

    setBusy(true);
    let assignmentId: string | null = null;
    let briefPath: string | null = null;
    try {
      const { data, error } = await portalDb
        .from("assignments")
        .insert({
          unit_no: 1,
          title: title.trim(),
          brief: brief.trim() || null,
          due_date: dueDate || null,
          part: numberPart,
          total_parts: numberParts,
          criteria_codes: selectedCodes,
          is_published: published,
        })
        .select("id")
        .single();
      if (error) throw error;
      assignmentId = data.id;

      const selectedTemplates = templates.filter((item) => selectedCodes.includes(item.code));
      const { error: criteriaError } = await portalDb.from("criteria").insert(
        selectedTemplates.map((item) => ({
          assignment_id: assignmentId,
          code: item.code,
          unit_no: item.unit_no,
          learning_aim: item.learning_aim,
          grade: item.grade,
          description: item.description,
          sort_order: item.sort_order,
          task_no: item.task_no,
        })),
      );
      if (criteriaError) throw criteriaError;

      const { error: classError } = await portalDb
        .from("assignment_classes")
        .insert(
          selectedClasses.map((classId) => ({ assignment_id: assignmentId, class_id: classId })),
        );
      if (classError) throw classError;

      if (briefFile) {
        briefPath = `${assignmentId}/${Date.now()}-${briefFile.name.replace(/[^\w.-]/g, "_")}`;
        const upload = await supabase.storage.from("briefs").upload(briefPath, briefFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: "application/pdf",
        });
        if (upload.error) throw upload.error;
        const { error: urlError } = await portalDb
          .from("assignments")
          .update({ brief_pdf_url: briefPath })
          .eq("id", assignmentId);
        if (urlError) throw urlError;
      }

      toast.success("Assignment created and assigned to the selected classes.");
      setTitle("");
      setBrief("");
      setDueDate("");
      setPart("1");
      setTotalParts("1");
      setSelectedCodes([]);
      setSelectedClasses([]);
      setBriefFile(null);
      setPublished(true);
      await refresh();
    } catch (error) {
      if (briefPath) await supabase.storage.from("briefs").remove([briefPath]);
      if (assignmentId) await portalDb.from("assignments").delete().eq("id", assignmentId);
      toast.error(error instanceof Error ? error.message : "Could not create the assignment.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(item: PortalAssignment) {
    const { error } = await portalDb
      .from("assignments")
      .update({ is_published: !item.is_published })
      .eq("id", item.id);
    if (error) toast.error(error.message);
    else {
      toast.success(item.is_published ? "Assignment unpublished." : "Assignment published.");
      await refresh();
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("assignments")}
        sub="Create Unit 1 assignments, select criteria, upload the brief and assign classes."
      />
      <form
        onSubmit={addAssignment}
        className="mb-10 space-y-5 rounded-xl border bg-card p-5 shadow-card"
      >
        <h2 className="text-xl font-bold">{t("createAssignment")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="assignment-title">{t("title")}</Label>
            <Input
              id="assignment-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignment-part">{t("part")}</Label>
            <Input
              id="assignment-part"
              type="number"
              min="1"
              value={part}
              onChange={(event) => setPart(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignment-total">Total parts</Label>
            <Input
              id="assignment-total"
              type="number"
              min="1"
              value={totalParts}
              onChange={(event) => setTotalParts(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignment-due">Due date</Label>
            <Input
              id="assignment-due"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignment-brief-file">Brief PDF</Label>
            <Input
              id="assignment-brief-file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setBriefFile(event.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="assignment-brief">Brief instructions</Label>
          <Textarea
            id="assignment-brief"
            rows={4}
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("criteria")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((criterion) => (
              <label
                key={criterion.code}
                className="flex items-start gap-2 rounded-lg border p-3 text-sm"
              >
                <Checkbox
                  checked={selectedCodes.includes(criterion.code)}
                  onCheckedChange={() =>
                    toggleValue(criterion.code, selectedCodes, setSelectedCodes)
                  }
                />
                <span>
                  <strong className="font-mono">{criterion.code}</strong> — {criterion.description}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("selectClasses")}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {classes.map((group) => (
              <label
                key={group.id}
                className="flex items-center gap-2 rounded-lg border p-3 text-sm"
              >
                <Checkbox
                  checked={selectedClasses.includes(group.id)}
                  onCheckedChange={() => toggleValue(group.id, selectedClasses, setSelectedClasses)}
                />
                <span>
                  {group.name} <span className="text-muted-foreground">({group.capacity})</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={published} onCheckedChange={(value) => setPublished(value === true)} />{" "}
          Publish to selected classes immediately
        </label>
        <Button type="submit" disabled={busy || templates.length === 0 || classes.length === 0}>
          <Plus className="h-4 w-4" /> {busy ? "Creating…" : t("createAssignment")}
        </Button>
      </form>

      <h2 className="mb-4 text-xl font-bold">Existing assignments</h2>
      {isLoading ? (
        <p className="text-muted-foreground">{t("loading")}</p>
      ) : assignments.length === 0 ? (
        <p className="text-muted-foreground">No assignments yet.</p>
      ) : (
        <div className="space-y-3">
          {assignments.map((item) => (
            <AssignmentCard
              key={item.id}
              assignment={item}
              classes={classes}
              onTogglePublish={togglePublish}
              onSaved={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({
  assignment,
  classes,
  onTogglePublish,
  onSaved,
}: {
  assignment: PortalAssignment;
  classes: Array<{ id: string; name: string }>;
  onTogglePublish: (assignment: PortalAssignment) => Promise<void>;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(assignment.class_ids);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(assignment.title);
  const [brief, setBrief] = useState(assignment.brief ?? "");
  const [dueDate, setDueDate] = useState(assignment.due_date ?? "");
  const [part, setPart] = useState(String(assignment.part));
  const [totalParts, setTotalParts] = useState(String(assignment.total_parts));

  async function saveDetails() {
    const partNumber = Number(part);
    const totalNumber = Number(totalParts);
    if (
      !title.trim() ||
      !Number.isInteger(partNumber) ||
      !Number.isInteger(totalNumber) ||
      partNumber < 1 ||
      totalNumber < partNumber
    ) {
      toast.error("Enter a title and valid part numbers.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await portalDb
        .from("assignments")
        .update({
          title: title.trim(),
          brief: brief.trim() || null,
          due_date: dueDate || null,
          part: partNumber,
          total_parts: totalNumber,
        })
        .eq("id", assignment.id);
      if (error) throw error;
      toast.success("Assignment details updated.");
      setEditing(false);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update assignment.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAssignment() {
    if (!window.confirm(`Permanently delete “${assignment.title}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const { count, error: countError } = await portalDb
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("assignment_id", assignment.id);
      if (countError) throw countError;
      if ((count ?? 0) > 0)
        throw new Error(
          "This assignment has submissions; it cannot be deleted because assessment history must be preserved.",
        );
      const { error } = await portalDb.from("assignments").delete().eq("id", assignment.id);
      if (error) throw error;
      if (assignment.brief_pdf_url) {
        const { error: storageError } = await supabase.storage
          .from("briefs")
          .remove([assignment.brief_pdf_url]);
        if (storageError)
          toast.warning(
            `Assignment deleted, but its brief file could not be removed: ${storageError.message}`,
          );
      }
      toast.success("Assignment deleted.");
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete assignment.");
    } finally {
      setBusy(false);
    }
  }

  async function saveClasses() {
    setBusy(true);
    try {
      const remove = assignment.class_ids.filter((id) => !selected.includes(id));
      if (remove.length) {
        const { error } = await portalDb
          .from("assignment_classes")
          .delete()
          .eq("assignment_id", assignment.id)
          .in("class_id", remove);
        if (error) throw error;
      }
      const add = selected.filter((id) => !assignment.class_ids.includes(id));
      if (add.length) {
        const { error } = await portalDb
          .from("assignment_classes")
          .insert(add.map((classId) => ({ assignment_id: assignment.id, class_id: classId })));
        if (error) throw error;
      }
      toast.success("Class assignment updated.");
      setOpen(false);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update class assignment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start gap-3">
        <FileText className="mt-1 h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{assignment.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {assignment.due_date ?? t("noDeadline")} ·{" "}
            {assignment.criteria.map((criterion) => criterion.code).join(", ")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {assignment.class_ids
              .map((id) => classes.find((group) => group.id === id)?.name)
              .filter(Boolean)
              .join(", ") || "No classes assigned"}
          </p>
        </div>
        <BadgeStatus published={assignment.is_published} />
        <Button size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
          {open ? "Close classes" : "Assign classes"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onTogglePublish(assignment)}>
          {assignment.is_published ? "Unpublish" : "Publish"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditing((value) => !value)}
          disabled={busy}
        >
          <Pencil className="mr-1 h-4 w-4" /> {editing ? "Close edit" : "Edit"}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => void deleteAssignment()}
          disabled={busy}
        >
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
      </div>
      {editing && (
        <div className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Assignment title</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Part</Label>
            <Input
              type="number"
              min="1"
              value={part}
              onChange={(event) => setPart(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Total parts</Label>
            <Input
              type="number"
              min="1"
              value={totalParts}
              onChange={(event) => setTotalParts(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Due date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Brief instructions</Label>
            <Textarea rows={3} value={brief} onChange={(event) => setBrief(event.target.value)} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" onClick={() => void saveDetails()} disabled={busy}>
              {busy ? "Saving…" : "Save details"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setTitle(assignment.title);
                setBrief(assignment.brief ?? "");
                setDueDate(assignment.due_date ?? "");
                setPart(String(assignment.part));
                setTotalParts(String(assignment.total_parts));
                setEditing(false);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Criteria and brief PDF are unchanged. Assignments with any submissions cannot be
            deleted.
          </p>
        </div>
      )}
      {open && (
        <div className="mt-5 border-t pt-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {classes.map((group) => (
              <label
                key={group.id}
                className="flex items-center gap-2 rounded-lg border p-3 text-sm"
              >
                <Checkbox
                  checked={selected.includes(group.id)}
                  onCheckedChange={() =>
                    setSelected((current) =>
                      current.includes(group.id)
                        ? current.filter((id) => id !== group.id)
                        : [...current, group.id],
                    )
                  }
                />
                {group.name}
              </label>
            ))}
          </div>
          <Button className="mt-3" size="sm" onClick={saveClasses} disabled={busy}>
            {busy ? "Saving…" : t("save")}
          </Button>
        </div>
      )}
    </article>
  );
}

function BadgeStatus({ published }: { published: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${published ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
    >
      {published ? "Published" : "Draft"}
    </span>
  );
}
