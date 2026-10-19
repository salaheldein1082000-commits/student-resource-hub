/** Maximum size accepted by the coursework submission flow. */
export const MAX_SUBMISSION_BYTES = 20 * 1024 * 1024;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Return a user-facing validation message, or null when the file is acceptable. */
export function validateSubmissionFile(file: File | null): string | null {
  if (!file) return "Choose a file before submitting.";
  if (file.size === 0) return "That file is empty. Choose a file with some content.";
  if (file.size > MAX_SUBMISSION_BYTES) return "Files must be 20 MB or smaller.";

  const name = file.name.toLowerCase();
  const isPdf = name.endsWith(".pdf") && (!file.type || file.type === "application/pdf");
  const isDocx = name.endsWith(".docx") && (!file.type || file.type === DOCX_MIME);
  if (!isPdf && !isDocx) return "Only PDF and DOCX files are accepted.";
  return null;
}
