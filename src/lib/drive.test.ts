import { describe, expect, it } from "vitest";
import { decodeDriveFileName } from "./drive";

describe("decodeDriveFileName", () => {
  it("decodes a normal UTF-8 filename", () => {
    expect(decodeDriveFileName(encodeURIComponent("Unit 1 report.pdf"), "fallback")).toBe(
      "Unit 1 report.pdf",
    );
  });

  it("strips path separators and control characters", () => {
    expect(decodeDriveFileName(encodeURIComponent("../private\nreport.docx"), "fallback")).toBe(
      ".._private_report.docx",
    );
  });

  it("uses a safe fallback for absent or malformed headers", () => {
    expect(decodeDriveFileName(null, "submission-1.pdf")).toBe("submission-1.pdf");
    expect(decodeDriveFileName("%E0%A4%A", "submission-2.pdf")).toBe("%E0%A4%A");
  });
});
