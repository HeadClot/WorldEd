import type { TransformMode } from '@/types/transform_mode.js';
import type { ShadingMode } from '@/types/shading_mode.js';
import type { SelectionMode } from '@/types/selection_mode.js';

/**
 * Callback for transform mode changes.
 *
 * @param mode The new transform mode to activate.
 */
export type TransformModeCallback = (mode: TransformMode) => void;

/** Callback for a generic action triggered by a keyboard shortcut. */
export type ActionCallback = () => void;

/**
 * Callback for shading mode changes.
 *
 * @param mode The new shading mode to apply.
 */
export type ShadingModeCallback = (mode: ShadingMode) => void;

/**
 * Callback for selection mode toggle.
 *
 * @param mode The new selection mode to activate.
 */
export type SelectionModeCallback = (mode: SelectionMode) => void;

/**
 * Optional guard that reports whether 3D fly navigation is active.
 *
 * @returns True when tool keys must be suppressed for fly mode.
 */
export type NavigationActiveCallback = () => boolean;

/**
 * Returns true when the event target is a text input that should own keys.
 *
 * @param event The keyboard event.
 * @returns True if shortcuts must not run.
 */
export function handlerKeyboardShortcutIsTypingInFormField(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return target.isContentEditable;
}
