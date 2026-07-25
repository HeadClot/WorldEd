import * as THREE from 'three';
import { Theme } from '../theme.js';
import { CadRulerStyle } from './cad_ruler_style.js';
import { CadRulerLineBatch } from './cad_ruler_line_batch.js';
import { CadRulerLabelLayer } from './cad_ruler_label_layer.js';
import type { CadLabelSpec, CadLineSegment } from './cad_dimension_geometry.js';

/**
 * Per-viewport CAD ruler rendering: world-space dual-pass lines plus sharp DOM
 * labels. Geometry is shared via uploaded segment lists from CadRulerSystem.
 */
export class CadRulerViewport {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private dimensionBatch: CadRulerLineBatch;
  private ghostBatch: CadRulerLineBatch;
  private labelLayer: CadRulerLabelLayer;
  private isDisposed: boolean;

  /**
   * Creates ruler rendering for one viewport.
   *
   * @param scene Viewport scene that receives line groups.
   * @param camera Viewport camera for label projection.
   * @param renderer Viewport renderer for canvas metrics.
   * @param container Viewport DOM container for label overlay.
   */
  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, container: HTMLElement) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.container = container;
    this.dimensionBatch = new CadRulerLineBatch(
      'cad_ruler_dimensions',
      CadRulerStyle.lineFrontOpacity,
      CadRulerStyle.lineOccludedOpacity,
    );
    this.ghostBatch = new CadRulerLineBatch(
      'cad_ruler_ghost',
      CadRulerStyle.ghostFrontOpacity,
      CadRulerStyle.ghostOccludedOpacity,
    );
    this.labelLayer = new CadRulerLabelLayer(container);
    this.isDisposed = false;
    this.scene.add(this.dimensionBatch.getObject());
    this.scene.add(this.ghostBatch.getObject());
  }

  /**
   * Uploads dimension segments and refreshes screen-space labels.
   *
   * @param segments Dimension and extension line segments.
   * @param labels Label specifications.
   */
  setDimensions(segments: CadLineSegment[], labels: CadLabelSpec[]): void {
    if (this.isDisposed) return;
    this.dimensionBatch.setSegments(segments);
    this.labelLayer.update(labels, this.camera, this.renderer);
  }

  /**
   * Uploads ghost bounds wireframe segments.
   *
   * @param segments Ghost wire segments.
   */
  setGhost(segments: CadLineSegment[]): void {
    if (this.isDisposed) return;
    this.ghostBatch.setSegments(segments);
  }

  /**
   * Reprojects existing labels after camera motion without rebuilding lines.
   *
   * @param labels Current label specifications.
   */
  refreshLabels(labels: CadLabelSpec[]): void {
    if (this.isDisposed) return;
    this.labelLayer.update(labels, this.camera, this.renderer);
  }

  /** Hides dimension lines, ghost, and labels. */
  clear(): void {
    this.dimensionBatch.clear();
    this.ghostBatch.clear();
    this.labelLayer.clear();
  }

  /**
   * Returns dimension segment count for tests.
   *
   * @returns Segment count.
   */
  getDimensionSegmentCount(): number {
    return this.dimensionBatch.getSegmentCount();
  }

  /**
   * Returns ghost segment count for tests.
   *
   * @returns Segment count.
   */
  getGhostSegmentCount(): number {
    return this.ghostBatch.getSegmentCount();
  }

  /**
   * Returns label chip pool size for tests.
   *
   * @returns Chip count.
   */
  getLabelChipCount(): number {
    return this.labelLayer.getChipCount();
  }

  /** Removes line groups and DOM labels. */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.scene.remove(this.dimensionBatch.getObject());
    this.scene.remove(this.ghostBatch.getObject());
    this.dimensionBatch.dispose();
    this.ghostBatch.dispose();
    this.labelLayer.dispose();
  }

  /**
   * Returns the theme size color used by this viewport (for tests).
   *
   * @returns Hex color from theme.
   */
  getThemeSizeColor(): number {
    return Theme.rulerSizeColor;
  }

  /**
   * Returns the viewport camera used for near-side placement and labels.
   *
   * @returns Camera instance.
   */
  getCamera(): THREE.Camera {
    return this.camera;
  }

  /**
   * Returns the viewport renderer used for screen-to-world offset metrics.
   *
   * @returns Renderer instance.
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }
}
