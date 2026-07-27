import type { EditorViewport } from '../../viewports/editor_viewport.js';
import type { ViewportKind } from '../../viewports/viewport_kind.js';

/**
 * Layout slot that can host a live viewport instance. Pane identity is stable
 * across type switches; the instance may be replaced or cleared.
 */
export class ViewportPane {
  private readonly id: string;
  private readonly container: HTMLElement;
  private kind: ViewportKind;
  private viewport: EditorViewport | null;
  private active: boolean;

  /**
   * Creates a pane descriptor for a DOM container.
   *
   * @param id Stable pane identifier (layout-independent).
   * @param container DOM host element for the viewport canvas and toolbar.
   * @param kind Semantic kind assigned to this pane.
   */
  constructor(id: string, container: HTMLElement, kind: ViewportKind) {
    this.id = id;
    this.container = container;
    this.kind = kind;
    this.viewport = null;
    this.active = true;
  }

  /**
   * Returns the stable pane id.
   *
   * @returns Pane identifier string.
   */
  getId(): string {
    return this.id;
  }

  /**
   * Returns the DOM container for this pane.
   *
   * @returns Host HTML element.
   */
  getContainer(): HTMLElement {
    return this.container;
  }

  /**
   * Returns the current viewport kind for this pane.
   *
   * @returns ViewportKind value.
   */
  getKind(): ViewportKind {
    return this.kind;
  }

  /**
   * Updates the kind metadata for this pane (instance may still be null).
   *
   * @param kind New viewport kind.
   */
  setKind(kind: ViewportKind): void {
    this.kind = kind;
  }

  /**
   * Returns the live viewport instance when present.
   *
   * @returns Editor viewport or null when the pane is empty.
   */
  getViewport(): EditorViewport | null {
    return this.viewport;
  }

  /**
   * Assigns a live viewport instance to this pane.
   *
   * @param viewport Created viewport, or null to clear.
   */
  setViewport(viewport: EditorViewport | null): void {
    this.viewport = viewport;
  }

  /**
   * Returns whether this pane should participate in rendering and input.
   *
   * @returns True when the pane is active.
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Marks the pane active or inactive for render/layout filtering.
   *
   * @param active Whether the pane should be considered live.
   */
  setActive(active: boolean): void {
    this.active = active;
  }
}
