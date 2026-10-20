export const STUDENT_CODE_PATTERN = /^[0-9]{6}$/;

export function isValidStudentCode(value: string): boolean {
  return STUDENT_CODE_PATTERN.test(value);
}

/** Student codes remain the portal password; the app never forces an initial rotation. */
export function needsInitialPasswordChange(
  _appMetadata: Record<string, unknown> | null | undefined,
): boolean {
  return false;
}
