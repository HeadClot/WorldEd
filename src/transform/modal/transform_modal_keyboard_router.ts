import { TransformModalKeyboardAction, type TransformModalKeyboardEvent } from './transform_modal_keyboard_action.js';
import { keyboardEventMatchesCode } from '@/input/keyboard_event_match.js';

/**
 * Maps a DOM keyboard event to a modal transform action during an active drag.
 *
 * @param event Browser keyboard event.
 * @returns Modal action payload, or null when the key is not modal.
 */
export function transformModalKeyboardRoute(event: KeyboardEvent): TransformModalKeyboardEvent | null {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  const axis = transformModalKeyboardRouteAxis(event);
  if (axis) {
    return axis;
  }
  const numeric = transformModalKeyboardRouteNumeric(event);
  if (numeric) {
    return numeric;
  }
  return transformModalKeyboardRouteConfirmCancel(event);
}

/**
 * Routes X / Y / Z axis lock toggles using layout-safe letter matching.
 *
 * @param event Browser keyboard event.
 * @returns Axis toggle action, or null.
 */
function transformModalKeyboardRouteAxis(event: KeyboardEvent): TransformModalKeyboardEvent | null {
  if (keyboardEventMatchesCode(event, 'KeyX')) {
    return { action: TransformModalKeyboardAction.ToggleAxisX };
  }
  if (keyboardEventMatchesCode(event, 'KeyY')) {
    return { action: TransformModalKeyboardAction.ToggleAxisY };
  }
  if (keyboardEventMatchesCode(event, 'KeyZ')) {
    return { action: TransformModalKeyboardAction.ToggleAxisZ };
  }
  return null;
}

/**
 * Routes digit, decimal, sign, and backspace typing.
 *
 * @param event Browser keyboard event.
 * @returns Numeric action, or null.
 */
function transformModalKeyboardRouteNumeric(event: KeyboardEvent): TransformModalKeyboardEvent | null {
  if (event.code === 'Backspace' || event.key === 'Backspace') {
    return { action: TransformModalKeyboardAction.Backspace };
  }
  if (transformModalKeyboardIsMinusKey(event)) {
    return { action: TransformModalKeyboardAction.ToggleSign };
  }
  if (event.code === 'Period' || event.code === 'NumpadDecimal' || event.key === '.' || event.key === ',') {
    return { action: TransformModalKeyboardAction.AppendDecimal };
  }
  const digit = transformModalKeyboardDigitFromEvent(event);
  if (digit !== null) {
    return { action: TransformModalKeyboardAction.AppendDigit, digit };
  }
  return null;
}

/**
 * Returns whether the event is a minus / subtract key (main or numpad). Matches
 * at any time during modal numeric entry, including with Shift held on the
 * physical minus key (key may be "_" while code stays Minus).
 *
 * @param event Browser keyboard event.
 * @returns True when the key should toggle the typed sign.
 */
function transformModalKeyboardIsMinusKey(event: KeyboardEvent): boolean {
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
    return true;
  }
  if (event.key === '-' || event.key === '−' || event.key === '﹣') {
    return true;
  }
  return false;
}

/**
 * Routes Enter confirm and Escape cancel.
 *
 * @param event Browser keyboard event.
 * @returns Confirm/cancel action, or null.
 */
function transformModalKeyboardRouteConfirmCancel(event: KeyboardEvent): TransformModalKeyboardEvent | null {
  if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.key === 'Enter') {
    return { action: TransformModalKeyboardAction.Confirm };
  }
  if (event.code === 'Escape' || event.key === 'Escape') {
    return { action: TransformModalKeyboardAction.Cancel };
  }
  return null;
}

/**
 * Extracts a single digit from a keyboard event when present.
 *
 * @param event Browser keyboard event.
 * @returns Digit character, or null.
 */
function transformModalKeyboardDigitFromEvent(event: KeyboardEvent): string | null {
  if (event.key.length === 1 && event.key >= '0' && event.key <= '9') {
    return event.key;
  }
  if (event.code.startsWith('Numpad') && event.code.length === 7) {
    const suffix = event.code.slice(6);
    if (/^[0-9]$/.test(suffix)) {
      return suffix;
    }
  }
  return null;
}
