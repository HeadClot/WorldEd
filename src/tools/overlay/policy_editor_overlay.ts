import { EditorOverlayId } from './editor_overlay_id.js';

/** Listener invoked when any overlay allowance changes. */
export type ListenerPolicyEditorOverlay = () => void;

/**
 * Shared allow/suppress registry for editor overlays (CAD rulers, etc.). Tools
 * suppress by a stable reason key and release on exit so multiple tools can
 * stack without fighting each other.
 */
export class PolicyEditorOverlay {
  private suppressions: Map<EditorOverlayId, Set<string>>;
  private listeners: ListenerPolicyEditorOverlay[];

  /** Creates an empty policy (all overlays allowed). */
  constructor() {
    this.suppressions = new Map();
    this.listeners = [];
  }

  /**
   * Suppresses an overlay for the given reason. No-op when already suppressed
   * under the same reason.
   *
   * @param overlayId Overlay to hide.
   * @param reasonKey Stable tool/session id (e.g. `clip_plane`).
   */
  suppress(overlayId: EditorOverlayId, reasonKey: string): void {
    const reasons = this.ensureReasonSet(overlayId);
    if (reasons.has(reasonKey)) return;
    reasons.add(reasonKey);
    this.notifyListeners();
  }

  /**
   * Releases one suppress reason. The overlay becomes allowed again only when
   * no reasons remain.
   *
   * @param overlayId Overlay that was suppressed.
   * @param reasonKey Reason previously passed to {@link suppress}.
   */
  release(overlayId: EditorOverlayId, reasonKey: string): void {
    const reasons = this.suppressions.get(overlayId);
    if (!reasons || !reasons.has(reasonKey)) return;
    reasons.delete(reasonKey);
    if (reasons.size === 0) {
      this.suppressions.delete(overlayId);
    }
    this.notifyListeners();
  }

  /**
   * Returns whether the overlay may be shown (no active suppress reasons).
   *
   * @param overlayId Overlay to query.
   * @returns True when nothing is suppressing the overlay.
   */
  isAllowed(overlayId: EditorOverlayId): boolean {
    const reasons = this.suppressions.get(overlayId);
    return !reasons || reasons.size === 0;
  }

  /**
   * Registers a listener for allowance changes (e.g. rebuild CAD rulers).
   *
   * @param listener Callback with no arguments.
   */
  addChangeListener(listener: ListenerPolicyEditorOverlay): void {
    this.listeners.push(listener);
  }

  /**
   * Unregisters a change listener.
   *
   * @param listener Previously registered callback.
   */
  removeChangeListener(listener: ListenerPolicyEditorOverlay): void {
    const index = this.listeners.indexOf(listener);
    if (index >= 0) this.listeners.splice(index, 1);
  }

  /**
   * Ensures a mutable reason set exists for the overlay.
   *
   * @param overlayId Overlay id.
   * @returns Reason set for that overlay.
   */
  private ensureReasonSet(overlayId: EditorOverlayId): Set<string> {
    let reasons = this.suppressions.get(overlayId);
    if (!reasons) {
      reasons = new Set();
      this.suppressions.set(overlayId, reasons);
    }
    return reasons;
  }

  /** Notifies all listeners of a policy change. */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}
