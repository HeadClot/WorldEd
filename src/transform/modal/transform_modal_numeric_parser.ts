/**
 * Parses a modal numeric buffer string into a finite number.
 *
 * @param text Buffer text from typed digits.
 * @returns Parsed number, or null when incomplete or invalid.
 */
export function transformModalNumericParse(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value;
}

/**
 * Returns whether buffer text is a partial number still being typed.
 *
 * @param text Buffer text from typed digits.
 * @returns True when the text is incomplete but not illegal.
 */
export function transformModalNumericIsPartial(text: string): boolean {
  if (text.length === 0) {
    return false;
  }
  return /^-?\d*\.?\d*$/.test(text);
}
