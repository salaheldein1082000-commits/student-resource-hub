import { describe, expect, it } from "vitest";
import { isValidStudentCode, needsInitialPasswordChange } from "./studentCode";

describe("student code format", () => {
  it("accepts exactly six numeric digits", () => {
    expect(isValidStudentCode("123456")).toBe(true);
    expect(isValidStudentCode("000123")).toBe(true);
  });

  it("rejects codes with any other length or non-digit characters", () => {
    expect(isValidStudentCode("12345")).toBe(false);
    expect(isValidStudentCode("1234567")).toBe(false);
    expect(isValidStudentCode("12a456")).toBe(false);
    expect(isValidStudentCode(" 123456")).toBe(false);
  });
});

describe("initial password routing", () => {
  it("requires a password change only when the app metadata flag is true", () => {
    expect(needsInitialPasswordChange({ must_change_password: true })).toBe(true);
    expect(needsInitialPasswordChange({ must_change_password: false })).toBe(false);
    expect(needsInitialPasswordChange({})).toBe(false);
    expect(needsInitialPasswordChange(null)).toBe(false);
  });
});
