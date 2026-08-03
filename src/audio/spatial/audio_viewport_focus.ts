import type { Camera } from 'three';
import {
  isOrthographicViewport,
  isPerspectiveViewport,
  type ViewportEditor,
} from '@/viewports/core/viewport_editor.js';

/** Spatial playback mode derived from the last interacted viewport. */
export type AudioSpatialMode = 'mono' | 'spatial3d';

/**
 * Tracks the viewport that should own mono vs 3D spatial audio. Focus is set on
 * exclusive-viewport pointerdown and when keyboard tools (G/R/S) resolve the
 * pane under the cursor — never on pointermove hover.
 */
export class AudioViewportFocus {
  private lastViewport: ViewportEditor | null;
  private readonly contentElementToViewport: Map<HTMLElement, ViewportEditor>;

  /** Creates an empty focus tracker. */
  constructor() {
    this.lastViewport = null;
    this.contentElementToViewport = new Map();
  }

  /**
   * Records a viewport as the most recent interaction target.
   *
   * @param viewport Viewport that received pointer or tool focus.
   */
  record(viewport: ViewportEditor): void {
    this.lastViewport = viewport;
  }

  /**
   * Records focus from a pinned viewport content element (input-bridge hit).
   *
   * @param contentElement Exclusive viewport content root under the pointer.
   */
  recordFromContentElement(contentElement: HTMLElement): void {
    const viewport = this.contentElementToViewport.get(contentElement);
    if (!viewport) {
      return;
    }
    this.record(viewport);
  }

  /**
   * Registers live viewport content elements so exclusive-root hits can resolve
   * back to a viewport. Replaces the previous registry.
   *
   * @param viewports Interactive viewports currently in the domain.
   */
  registerViewports(viewports: readonly ViewportEditor[]): void {
    this.contentElementToViewport.clear();
    for (let index = 0; index < viewports.length; index++) {
      const viewport = viewports[index];
      if (!viewport) {
        continue;
      }
      const contentElement = viewport.getContentElement();
      if (!contentElement) {
        continue;
      }
      this.contentElementToViewport.set(contentElement, viewport);
    }
  }

  /** Clears the last-viewport focus (e.g. tests or dispose). */
  clear(): void {
    this.lastViewport = null;
  }

  /** Clears focus and the content-element registry. */
  clearAll(): void {
    this.lastViewport = null;
    this.contentElementToViewport.clear();
  }

  /**
   * Returns the last interacted viewport, if any.
   *
   * @returns Viewport or null.
   */
  getLastViewport(): ViewportEditor | null {
    return this.lastViewport;
  }

  /**
   * Returns mono for 2D/unknown and spatial3d for perspective viewports.
   *
   * @returns Spatial mode for the next sound.
   */
  getSpatialMode(): AudioSpatialMode {
    const viewport = this.lastViewport;
    if (!viewport) {
      return 'mono';
    }
    if (isPerspectiveViewport(viewport)) {
      return 'spatial3d';
    }
    if (isOrthographicViewport(viewport)) {
      return 'mono';
    }
    return 'mono';
  }

  /**
   * Returns the camera of the last interacted viewport when available.
   *
   * @returns Camera or null.
   */
  getCamera(): Camera | null {
    const viewport = this.lastViewport;
    if (!viewport) {
      return null;
    }
    return viewport.getCamera();
  }
}

/** Shared last-viewport focus for spatial audio. */
export const audioViewportFocus = new AudioViewportFocus();
