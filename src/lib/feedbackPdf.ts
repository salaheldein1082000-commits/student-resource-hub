export type FeedbackPrintInput = {
  locale: "en" | "ar";
  assignmentTitle: string;
  studentName: string;
  className: string | null;
  attemptNo: number;
  assessorName: string | null;
  publishedAt: string | null;
  generalComments: string | null;
  criteria: Array<{
    code: string;
    description: string;
    achieved: boolean | null;
    comment: string | null;
  }>;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export function printFeedbackAsPdf(input: FeedbackPrintInput): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("Allow pop-ups for this site, then try the PDF export again.");

  const arabic = input.locale === "ar";
  const labels = arabic
    ? {
        form: "نموذج ملاحظات التقييم",
        unit: "الوحدة 1 — أنظمة تقنية المعلومات: الاستراتيجية والإدارة والبنية التحتية",
        student: "الطالب",
        className: "الفصل",
        assignment: "التكليف",
        attempt: "المحاولة",
        assessor: "المقيّم",
        published: "تاريخ النشر",
        criteria: "المعايير",
        description: "الوصف",
        achieved: "محقق",
        comments: "الملاحظات",
        yes: "نعم",
        no: "لا",
        general: "ملاحظات عامة",
        academy: "أكاديمية السويدي الفنية",
      }
    : {
        form: "Assessment Feedback Form",
        unit: "Unit 1 — IT Systems: Strategy, Management and Infrastructure",
        student: "Student",
        className: "Class",
        assignment: "Assignment",
        attempt: "Attempt",
        assessor: "Assessor",
        published: "Published",
        criteria: "Criteria",
        description: "Description",
        achieved: "Achieved",
        comments: "Comments",
        yes: "Yes",
        no: "No",
        general: "General Comments",
        academy: "Elsewedy Technical Academy",
      };
  const date = input.publishedAt
    ? new Intl.DateTimeFormat(arabic ? "ar-EG" : "en-GB", { dateStyle: "long" }).format(
        new Date(input.publishedAt),
      )
    : "—";
  const criterionRows = input.criteria
    .map(
      (criterion) => `
      <tr>
        <td dir="ltr" class="code">${escapeHtml(criterion.code)}</td>
        <td>${escapeHtml(criterion.description)}</td>
        <td>${criterion.achieved === null ? "—" : criterion.achieved ? labels.yes : labels.no}</td>
        <td>${escapeHtml(criterion.comment ?? "—")}</td>
      </tr>`,
    )
    .join("");

  const documentHtml = `<!doctype html>
<html lang="${arabic ? "ar" : "en"}" dir="${arabic ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(labels.form)} — ${escapeHtml(input.assignmentTitle)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #17252b; font: 12px/1.5 Arial, sans-serif; }
    h1 { margin: 4px 0 2px; font-size: 23px; }
    h2 { margin: 0 0 8px; font-size: 15px; }
    .academy { color: #07515a; font-size: 11px; font-weight: 700; letter-spacing: .04em; }
    .unit { margin: 0 0 18px; color: #52646b; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; margin: 16px 0 22px; }
    .meta div { border-bottom: 1px solid #b8c0c2; padding: 5px 0; }
    .meta strong { display: inline-block; min-width: 84px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #77868b; padding: 7px; text-align: start; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #eaf0f0; }
    th:nth-child(1), td:nth-child(1) { width: 13%; }
    th:nth-child(2), td:nth-child(2) { width: 39%; }
    th:nth-child(3), td:nth-child(3) { width: 14%; }
    th:nth-child(4), td:nth-child(4) { width: 34%; }
    td.code { font-family: monospace; }
    .general { margin-top: 20px; min-height: 88px; border: 1px solid #77868b; padding: 10px; white-space: pre-wrap; }
    .general h2 { margin-top: 0; }
    .footer { margin-top: 16px; color: #607176; font-size: 10px; }
    @media print { tr, .meta div, .general { break-inside: avoid; } }
  </style>
</head>
<body>
  <header>
    <div class="academy">${escapeHtml(labels.academy)}</div>
    <h1>${escapeHtml(labels.form)}</h1>
    <p class="unit">${escapeHtml(labels.unit)}</p>
  </header>
  <section class="meta">
    <div><strong>${escapeHtml(labels.student)}:</strong> ${escapeHtml(input.studentName)}</div>
    <div><strong>${escapeHtml(labels.className)}:</strong> ${escapeHtml(input.className ?? "—")}</div>
    <div><strong>${escapeHtml(labels.assignment)}:</strong> ${escapeHtml(input.assignmentTitle)}</div>
    <div><strong>${escapeHtml(labels.attempt)}:</strong> ${input.attemptNo}</div>
    <div><strong>${escapeHtml(labels.assessor)}:</strong> ${escapeHtml(input.assessorName ?? "—")}</div>
    <div><strong>${escapeHtml(labels.published)}:</strong> ${escapeHtml(date)}</div>
  </section>
  <h2>${escapeHtml(labels.criteria)}</h2>
  <table>
    <thead><tr><th>${escapeHtml(labels.criteria)}</th><th>${escapeHtml(labels.description)}</th><th>${escapeHtml(labels.achieved)} (${escapeHtml(labels.yes)}/${escapeHtml(labels.no)})</th><th>${escapeHtml(labels.comments)}</th></tr></thead>
    <tbody>${criterionRows}</tbody>
  </table>
  <section class="general"><h2>${escapeHtml(labels.general)}</h2>${escapeHtml(input.generalComments ?? "—")}</section>
  <div class="footer">${escapeHtml(labels.academy)} · BTEC Assessment Portal</div>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(documentHtml);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 200);
}
