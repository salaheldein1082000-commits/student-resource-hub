/** Share of (students × assignments) slots that have at least one submission. 0–100. */
export function submissionRate(studentCount: number, assignmentCount: number, submissionCount: number) {
  const slots = studentCount * assignmentCount;
  if (slots === 0) return 0;
  return Math.round((Math.min(submissionCount, slots) / slots) * 100);
}

/** Per criterion: % of assessed latest attempts where it was achieved. */
export function criteriaAchievement(
  results: { criterion_code: string; achieved: boolean }[],
): Record<string, { achieved: number; total: number; pct: number }> {
  const out: Record<string, { achieved: number; total: number; pct: number }> = {};
  for (const r of results) {
    const o = (out[r.criterion_code] ??= { achieved: 0, total: 0, pct: 0 });
    o.total++;
    if (r.achieved) o.achieved++;
  }
  for (const o of Object.values(out)) o.pct = Math.round((o.achieved / o.total) * 100);
  return out;
}
