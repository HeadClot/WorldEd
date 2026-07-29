/**
 * Copies defined optional fields onto a target object. Safe for
 * exactOptionalPropertyTypes (never assigns explicit undefined).
 *
 * @param target Object to mutate.
 * @param source Partial fields; undefined values are skipped.
 * @returns The same target reference.
 */
export function assignDefined<T extends object>(target: T, source: Partial<T>): T {
  for (const key of Object.keys(source) as Array<keyof T>) {
    const value = source[key];
    if (value !== undefined) target[key] = value as T[keyof T];
  }
  return target;
}

/**
 * Applies optional snap/exact flags when present.
 *
 * @param target Object with optional snap/exact.
 * @param source Source flags.
 */
export function assignSnapExact(
  target: { snap?: boolean; exact?: boolean },
  source: { snap?: boolean; exact?: boolean },
): void {
  if (source.snap !== undefined) target.snap = source.snap;
  if (source.exact !== undefined) target.exact = source.exact;
}
