/**
 * Layout-safe keyboard matching. Letter and digit shortcuts follow the produced
 * character ({@link KeyboardEvent.key}) so QWERTZ/AZERTY match the labeled key.
 * Non-character keys still use physical {@link KeyboardEvent.code}.
 */

/**
 * Returns whether a keyboard event matches a stored shortcut code binding.
 *
 * @param event Browser keyboard event.
 * @param code Stored binding (`KeyZ`, `Digit1`, `Escape`, …).
 * @returns True when the event should activate that binding on any layout.
 */
export function keyboardEventMatchesCode(event: KeyboardEvent, code: string): boolean {
  const logicalLetter = keyboardCodeToLogicalLetter(code);
  if (logicalLetter !== null) {
    return keyboardEventProducesLetter(event, logicalLetter);
  }
  const logicalDigit = keyboardCodeToLogicalDigit(code);
  if (logicalDigit !== null) {
    return keyboardEventProducesDigit(event, logicalDigit);
  }
  return event.code === code;
}

/**
 * Builds a layout-stable shortcut code from a capture event. Letter keys are
 * stored as KeyA–KeyZ from the produced character so a German Z stores KeyZ
 * even though its physical code is KeyY.
 *
 * @param event Browser keyboard event from shortcut capture.
 * @returns Code string suitable for {@link keyboardEventMatchesCode}.
 */
export function keyboardShortcutCodeFromEvent(event: KeyboardEvent): string {
  const letter = keyboardEventLetter(event);
  if (letter !== null) {
    return `Key${letter.toUpperCase()}`;
  }
  const digit = keyboardEventDigit(event);
  if (digit !== null) {
    return `Digit${digit}`;
  }
  const minusCode = keyboardShortcutCodeFromMinusEvent(event);
  if (minusCode !== null) {
    return minusCode;
  }
  return event.code;
}

/**
 * Maps main-row and numpad minus / subtract keys to a stable code.
 *
 * @param event Browser keyboard event.
 * @returns Minus or NumpadSubtract, or null when not a minus key.
 */
function keyboardShortcutCodeFromMinusEvent(event: KeyboardEvent): string | null {
  if (event.code === 'NumpadSubtract') {
    return 'NumpadSubtract';
  }
  if (event.code === 'Minus') {
    return 'Minus';
  }
  if (event.key === '-' || event.key === '−' || event.key === '﹣') {
    return event.code === 'NumpadSubtract' ? 'NumpadSubtract' : 'Minus';
  }
  return null;
}

/**
 * Maps a KeyA–KeyZ code to its logical letter.
 *
 * @param code Shortcut code.
 * @returns Lowercase letter, or null when not a letter binding.
 */
function keyboardCodeToLogicalLetter(code: string): string | null {
  if (!code.startsWith('Key') || code.length !== 4) {
    return null;
  }
  const letter = code.slice(3).toLowerCase();
  if (letter < 'a' || letter > 'z') {
    return null;
  }
  return letter;
}

/**
 * Maps a Digit0–Digit9 code to its logical digit character.
 *
 * @param code Shortcut code.
 * @returns Digit character, or null when not a digit binding.
 */
function keyboardCodeToLogicalDigit(code: string): string | null {
  if (!code.startsWith('Digit') || code.length !== 6) {
    return null;
  }
  const digit = code.slice(5);
  if (digit < '0' || digit > '9') {
    return null;
  }
  return digit;
}

/**
 * Returns whether the event produces the given letter (layout-aware).
 *
 * @param event Browser keyboard event.
 * @param letter Lowercase a–z.
 * @returns True when the event's character matches.
 */
function keyboardEventProducesLetter(event: KeyboardEvent, letter: string): boolean {
  const produced = keyboardEventLetter(event);
  if (produced === letter) {
    return true;
  }
  return event.code === `Key${letter.toUpperCase()}` && produced === null;
}

/**
 * Returns whether the event produces the given digit (layout-aware).
 *
 * @param event Browser keyboard event.
 * @param digit Character 0–9.
 * @returns True when the event's character matches.
 */
function keyboardEventProducesDigit(event: KeyboardEvent, digit: string): boolean {
  const produced = keyboardEventDigit(event);
  if (produced === digit) {
    return true;
  }
  return event.code === `Digit${digit}` && produced === null;
}

/**
 * Reads a single a–z letter from the event when available.
 *
 * @param event Browser keyboard event.
 * @returns Lowercase letter, or null.
 */
function keyboardEventLetter(event: KeyboardEvent): string | null {
  if (event.key.length !== 1) {
    return null;
  }
  const letter = event.key.toLowerCase();
  if (letter < 'a' || letter > 'z') {
    return null;
  }
  return letter;
}

/**
 * Reads a single 0–9 digit from the event when available.
 *
 * @param event Browser keyboard event.
 * @returns Digit character, or null.
 */
function keyboardEventDigit(event: KeyboardEvent): string | null {
  if (event.key.length !== 1) {
    return null;
  }
  if (event.key < '0' || event.key > '9') {
    return null;
  }
  return event.key;
}
