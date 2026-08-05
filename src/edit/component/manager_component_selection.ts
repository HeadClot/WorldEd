import { buildComponentSelectionIdentity, type ComponentSelectionEntry } from './component_selection_entry.js';

/**
 * Callback when the component selection set changes.
 *
 * @param selected Current selection entries.
 */
export type ComponentSelectionChangedCallback = (selected: readonly ComponentSelectionEntry[]) => void;

/** Manages Edit Mode vertex / edge / face selection entries. */
export class ManagerComponentSelection {
  private entries: ComponentSelectionEntry[];
  private readonly identitySet: Set<string>;
  private changeCallback: ComponentSelectionChangedCallback | null;

  /** Creates an empty component selection manager. */
  constructor() {
    this.entries = [];
    this.identitySet = new Set();
    this.changeCallback = null;
  }

  /**
   * Registers a change listener.
   *
   * @param callback Listener, or null to clear.
   */
  setChangeCallback(callback: ComponentSelectionChangedCallback | null): void {
    this.changeCallback = callback;
  }

  /**
   * Returns a copy of the current selection.
   *
   * @returns Selected entries.
   */
  getSelected(): ComponentSelectionEntry[] {
    return this.entries.slice();
  }

  /**
   * Returns the number of selected components.
   *
   * @returns Selection count.
   */
  getSelectedCount(): number {
    return this.entries.length;
  }

  /**
   * Replaces or extends selection with one entry.
   *
   * @param entry Component to select.
   * @param addToSelection When true, adds without clearing.
   */
  select(entry: ComponentSelectionEntry, addToSelection: boolean): void {
    if (!addToSelection) {
      this.entries = [];
      this.identitySet.clear();
    }
    const identity = buildComponentSelectionIdentity(entry);
    if (this.identitySet.has(identity)) {
      this.notifyChange();
      return;
    }
    this.identitySet.add(identity);
    this.entries.push(entry);
    this.notifyChange();
  }

  /**
   * Toggles one entry in the selection set.
   *
   * @param entry Component to toggle.
   */
  toggle(entry: ComponentSelectionEntry): void {
    const identity = buildComponentSelectionIdentity(entry);
    if (this.identitySet.has(identity)) {
      this.removeIdentity(identity);
      this.notifyChange();
      return;
    }
    this.identitySet.add(identity);
    this.entries.push(entry);
    this.notifyChange();
  }

  /** Clears all selected components. */
  clear(): void {
    if (this.entries.length === 0) {
      return;
    }
    this.entries = [];
    this.identitySet.clear();
    this.notifyChange();
  }

  /**
   * Replaces the entire selection with the given entries (deduped).
   *
   * @param entries New selection set.
   */
  replaceAll(entries: readonly ComponentSelectionEntry[]): void {
    this.entries = [];
    this.identitySet.clear();
    for (const entry of entries) {
      const identity = buildComponentSelectionIdentity(entry);
      if (this.identitySet.has(identity)) {
        continue;
      }
      this.identitySet.add(identity);
      this.entries.push(entry);
    }
    this.notifyChange();
  }

  /**
   * Removes every entry whose identity matches the given key.
   *
   * @param identity Selection identity from
   *   {@link buildComponentSelectionIdentity}.
   */
  private removeIdentity(identity: string): void {
    this.identitySet.delete(identity);
    this.entries = this.entries.filter((entry) => buildComponentSelectionIdentity(entry) !== identity);
  }

  /** Notifies the change listener. */
  private notifyChange(): void {
    this.changeCallback?.(this.getSelected());
  }
}
