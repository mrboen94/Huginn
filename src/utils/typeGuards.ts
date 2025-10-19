export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRecordOfStrings(value: unknown): value is Record<string, string> {
  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'string');
}
