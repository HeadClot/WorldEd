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
