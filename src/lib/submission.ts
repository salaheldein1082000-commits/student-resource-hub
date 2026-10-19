/** Maximum size accepted by the coursework submission flow. */
export const MAX_SUBMISSION_BYTES = 50 * 1024 * 1024;

/** Return a user-facing validation message, or null when the file is acceptable. */
export function validateSubmissionFile(file: File | null): string | null {
  if (!file) return "Choose a file before submitting.";
  if (file.size === 0) return "That file is empty. Choose a file with some content.";
  if (file.size > MAX_SUBMISSION_BYTES) {
    return "Files must be 50 MB or smaller.";
  }
  return null;
}
