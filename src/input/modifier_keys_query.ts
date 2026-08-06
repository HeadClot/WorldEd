import type { ManagerInput } from './manager_input.js';

/**
 * Modifier flags carried by browser pointer and keyboard events. The input
 * bridge stamps these onto the editor so multi-window tools never depend on a
 * single window's key map alone.
 */
export interface DomModifierKeyFlags {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * Returns whether any input manager reports Shift held.
 *
 * @param managers Main and detached popup input managers.
 * @returns True when left or right Shift is down in any window.
 */
export function isShiftPressedOnInputManagers(managers: readonly ManagerInput[]): boolean {
  for (const manager of managers) {
    if (manager.isShiftDown()) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether any input manager reports Ctrl held.
 *
 * @param managers Main and detached popup input managers.
 * @returns True when left or right Control is down in any window.
 */
export function isCtrlPressedOnInputManagers(managers: readonly ManagerInput[]): boolean {
  for (const manager of managers) {
    if (manager.isCtrlDown()) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether any input manager reports Alt held.
 *
 * @param managers Main and detached popup input managers.
 * @returns True when left or right Alt is down in any window.
 */
export function isAltPressedOnInputManagers(managers: readonly ManagerInput[]): boolean {
  for (const manager of managers) {
    if (manager.isAltDown()) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether any input manager reports Meta held.
 *
 * @param managers Main and detached popup input managers.
 * @returns True when left or right Meta is down in any window.
 */
export function isMetaPressedOnInputManagers(managers: readonly ManagerInput[]): boolean {
  for (const manager of managers) {
    if (manager.isKeyDown('MetaLeft') || manager.isKeyDown('MetaRight')) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether Ctrl or Meta is held on any input manager (toggle
 * multi-select).
 *
 * @param managers Main and detached popup input managers.
 * @returns True when Control or Meta is down in any window.
 */
export function isCtrlOrMetaPressedOnInputManagers(managers: readonly ManagerInput[]): boolean {
  return isCtrlPressedOnInputManagers(managers) || isMetaPressedOnInputManagers(managers);
}

/**
 * Returns whether any modifier (Shift / Ctrl / Alt / Meta) is held on any
 * manager.
 *
 * @param managers Main and detached popup input managers.
 * @returns True when a modifier is down in any window.
 */
export function isAnyModifierPressedOnInputManagers(managers: readonly ManagerInput[]): boolean {
  return (
    isShiftPressedOnInputManagers(managers) ||
    isCtrlOrMetaPressedOnInputManagers(managers) ||
    isAltPressedOnInputManagers(managers)
  );
}

/**
 * Returns whether Shift is active from DOM event flags.
 *
 * @param flags Browser event modifier flags.
 * @returns True when shiftKey is set.
 */
export function isShiftPressedOnDomFlags(flags: DomModifierKeyFlags): boolean {
  return flags.shiftKey === true;
}

/**
 * Returns whether Ctrl or Meta is active from DOM event flags.
 *
 * @param flags Browser event modifier flags.
 * @returns True when ctrlKey or metaKey is set.
 */
export function isCtrlOrMetaPressedOnDomFlags(flags: DomModifierKeyFlags): boolean {
  return flags.ctrlKey === true || flags.metaKey === true;
}

/**
 * Returns whether Alt is active from DOM event flags.
 *
 * @param flags Browser event modifier flags.
 * @returns True when altKey is set.
 */
export function isAltPressedOnDomFlags(flags: DomModifierKeyFlags): boolean {
  return flags.altKey === true;
}

/**
 * Returns whether any modifier is active from DOM event flags.
 *
 * @param flags Browser event modifier flags.
 * @returns True when any modifier flag is set.
 */
export function isAnyModifierPressedOnDomFlags(flags: DomModifierKeyFlags): boolean {
  return isShiftPressedOnDomFlags(flags) || isCtrlOrMetaPressedOnDomFlags(flags) || isAltPressedOnDomFlags(flags);
}
