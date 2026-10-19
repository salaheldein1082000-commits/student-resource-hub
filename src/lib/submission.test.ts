import { describe, expect, it } from "vitest";
import { MAX_SUBMISSION_BYTES, validateSubmissionFile } from "./submission";

describe("validateSubmissionFile", () => {
  it("requires a file", () => {
    expect(validateSubmissionFile(null)).toBe("Choose a file before submitting.");
  });

  it("rejects empty files", () => {
    expect(
      validateSubmissionFile(new File([], "empty.pdf", { type: "application/pdf" })),
    ).toContain("empty");
  });

  it("rejects files over the 20 MB limit", () => {
    expect(
      validateSubmissionFile(
        new File([new Uint8Array(MAX_SUBMISSION_BYTES + 1)], "large.pdf", {
          type: "application/pdf",
        }),
      ),
    ).toContain("20 MB");
  });

  it("rejects file types other than PDF and DOCX", () => {
    expect(
      validateSubmissionFile(new File(["work"], "work.zip", { type: "application/zip" })),
    ).toContain("Only PDF and DOCX");
  });

  it("accepts PDF and DOCX files within the limit", () => {
    expect(
      validateSubmissionFile(new File(["report"], "work.pdf", { type: "application/pdf" })),
    ).toBeNull();
    expect(
      validateSubmissionFile(
        new File(["report"], "work.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ),
    ).toBeNull();
  });
});
