import { createViewportForKind, type ViewportFactoryDependencies } from '../../viewports/viewport_factory.js';
import { disposeEditorViewport } from '../../viewports/viewport_dispose.js';
import type { EditorViewport } from '../../viewports/editor_viewport.js';
import {
  DEFAULT_VIEWPORT_QUAD_KINDS,
  ViewportKind,
  getViewportKindDisplayLabel,
} from '../../viewports/viewport_kind.js';
import { ViewportPane } from './viewport_pane.js';

/** Stable default pane ids for the classic four-viewport layout. */
export const DEFAULT_PANE_IDS = ['pane_top', 'pane_front', 'pane_side', 'pane_perspective'] as const;

/**
 * Creates a viewport for a kind. Injectable for unit tests without WebGL.
 *
 * @param kind Viewport kind.
 * @param container Host element.
 * @param dependencies Factory dependencies.
 * @returns Live viewport instance.
 */
export type ViewportCreateFn = (
  kind: ViewportKind,
  container: HTMLElement,
  dependencies: ViewportFactoryDependencies,
) => EditorViewport;

/**
 * Owns layout panes and their live viewport instances. Consumers iterate active
 * viewports instead of hard-coded Top/Front/Side/Perspective fields.
 */
export class ViewportRegistry {
  private panes: ViewportPane[];
  private factoryDependencies: ViewportFactoryDependencies | null;
  private createViewport: ViewportCreateFn;

  /**
   * Creates an empty registry. Call populateDefaultQuad or addPane to fill.
   *
   * @param createViewport Optional factory override for tests.
   */
  constructor(createViewport: ViewportCreateFn = createViewportForKind) {
    this.panes = [];
    this.factoryDependencies = null;
    this.createViewport = createViewport;
  }

  /**
   * Stores factory dependencies used for create and replace operations.
   *
   * @param dependencies Input manager and related construction deps.
   */
  setFactoryDependencies(dependencies: ViewportFactoryDependencies): void {
    this.factoryDependencies = dependencies;
  }

  /**
   * Builds the classic four-pane layout into the given containers.
   *
   * @param containers DOM containers in default quad order.
   * @param dependencies Factory dependencies for viewport construction.
   */
  populateDefaultQuad(containers: HTMLElement[], dependencies: ViewportFactoryDependencies): void {
    this.setFactoryDependencies(dependencies);
    this.disposeAllViewports();
    this.panes = [];
    DEFAULT_VIEWPORT_QUAD_KINDS.forEach((kind, index) => {
      const container = containers[index];
      if (!container) return;
      const paneId = DEFAULT_PANE_IDS[index] ?? `pane_${index}`;
      this.addPaneWithKind(paneId, container, kind);
    });
  }

  /**
   * Adds a pane and immediately creates a viewport of the given kind.
   *
   * @param id Stable pane id.
   * @param container Host DOM element.
   * @param kind Viewport kind to create.
   * @returns The created pane.
   */
  addPaneWithKind(id: string, container: HTMLElement, kind: ViewportKind): ViewportPane {
    const pane = new ViewportPane(id, container, kind);
    this.panes.push(pane);
    this.createViewportInPane(pane, kind);
    return pane;
  }

  /**
   * Returns all panes in registration order.
   *
   * @returns Readonly pane list.
   */
  getPanes(): readonly ViewportPane[] {
    return this.panes;
  }

  /**
   * Returns a pane by id when present.
   *
   * @param id Pane identifier.
   * @returns Matching pane or null.
   */
  getPaneById(id: string): ViewportPane | null {
    return this.panes.find((pane) => pane.getId() === id) ?? null;
  }

  /**
   * Returns a pane by index when present.
   *
   * @param index Zero-based pane index.
   * @returns Matching pane or null.
   */
  getPaneByIndex(index: number): ViewportPane | null {
    return this.panes[index] ?? null;
  }

  /**
   * Returns live viewport instances for active panes that have an instance.
   *
   * @returns Active editor viewports.
   */
  getActiveViewports(): EditorViewport[] {
    return this.panes
      .filter((pane) => pane.isActive())
      .map((pane) => pane.getViewport())
      .filter((viewport): viewport is EditorViewport => viewport !== null);
  }

  /**
   * Returns every live viewport instance regardless of active flag.
   *
   * @returns All non-null viewport instances.
   */
  getAllViewports(): EditorViewport[] {
    return this.panes
      .map((pane) => pane.getViewport())
      .filter((viewport): viewport is EditorViewport => viewport !== null);
  }

  /**
   * Returns pane DOM containers in registration order.
   *
   * @returns Container elements.
   */
  getContainers(): HTMLElement[] {
    return this.panes.map((pane) => pane.getContainer());
  }

  /**
   * Marks panes active when their id is listed; others become inactive.
   *
   * @param activeIds Pane ids that should remain active.
   */
  setActivePaneIds(activeIds: readonly string[]): void {
    const activeSet = new Set(activeIds);
    this.panes.forEach((pane) => {
      pane.setActive(activeSet.has(pane.getId()));
    });
  }

  /** Marks every pane active. */
  activateAllPanes(): void {
    this.panes.forEach((pane) => pane.setActive(true));
  }

  /**
   * Replaces the viewport kind in a pane by disposing the old instance and
   * creating a new one.
   *
   * @param paneId Target pane id.
   * @param kind Desired viewport kind.
   * @returns The new viewport instance, or null if the pane is missing.
   */
  replaceKind(paneId: string, kind: ViewportKind): EditorViewport | null {
    const pane = this.getPaneById(paneId);
    if (!pane) return null;
    this.disposeViewportInPane(pane);
    pane.setKind(kind);
    return this.createViewportInPane(pane, kind);
  }

  /**
   * Disposes the live instance in a pane without removing the pane itself.
   *
   * @param paneId Target pane id.
   */
  clearViewport(paneId: string): void {
    const pane = this.getPaneById(paneId);
    if (!pane) return;
    this.disposeViewportInPane(pane);
  }

  /** Disposes every live viewport instance while keeping pane descriptors. */
  disposeAllViewports(): void {
    this.panes.forEach((pane) => this.disposeViewportInPane(pane));
  }

  /** Disposes all viewports and clears pane registration. */
  dispose(): void {
    this.disposeAllViewports();
    this.panes = [];
    this.factoryDependencies = null;
  }

  /**
   * Creates a viewport for a pane and stores it.
   *
   * @param pane Target pane.
   * @param kind Kind to instantiate.
   * @returns Created viewport, or null when factory deps are missing.
   */
  private createViewportInPane(pane: ViewportPane, kind: ViewportKind): EditorViewport | null {
    if (!this.factoryDependencies) return null;
    const viewport = this.createViewport(kind, pane.getContainer(), this.factoryDependencies);
    viewport.setName(getViewportKindDisplayLabel(kind));
    viewport.setViewportKind(kind);
    pane.setViewport(viewport);
    pane.setKind(kind);
    return viewport;
  }

  /**
   * Disposes and clears the viewport stored on a pane.
   *
   * @param pane Pane whose instance should be removed.
   */
  private disposeViewportInPane(pane: ViewportPane): void {
    const viewport = pane.getViewport();
    if (!viewport) return;
    disposeEditorViewport(viewport);
    pane.setViewport(null);
  }
}
