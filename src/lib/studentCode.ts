export const STUDENT_CODE_PATTERN = /^[0-9]{6}$/;

export function isValidStudentCode(value: string): boolean {
  return STUDENT_CODE_PATTERN.test(value);
}

export function needsInitialPasswordChange(
  appMetadata: Record<string, unknown> | null | undefined,
): boolean {
  return appMetadata?.["must_change_password"] === true;
}
