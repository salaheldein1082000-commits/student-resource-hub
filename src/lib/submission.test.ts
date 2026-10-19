import { describe, expect, it } from "vitest";
import { MAX_SUBMISSION_BYTES, validateSubmissionFile } from "./submission";

describe("validateSubmissionFile", () => {
  it("requires a file", () => {
    expect(validateSubmissionFile(null)).toBe("Choose a file before submitting.");
  });

  it("rejects empty files", () => {
    expect(validateSubmissionFile(new File([], "empty.pdf"))).toContain("empty");
  });

  it("rejects files over the size limit", () => {
    expect(
      validateSubmissionFile(new File([new Uint8Array(MAX_SUBMISSION_BYTES + 1)], "large.zip")),
    ).toContain("50 MB");
  });

  it("accepts a non-empty file within the limit", () => {
    expect(validateSubmissionFile(new File(["coursework"], "work.pdf"))).toBeNull();
  });
});
