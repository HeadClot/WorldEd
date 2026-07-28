import * as THREE from 'three';
import { Theme } from '../theme.js';
import { CadRulerStyle } from './cad_ruler_style.js';
import { CadRulerLineBatch } from './cad_ruler_line_batch.js';
import { CadRulerLabelLayer } from './cad_ruler_label_layer.js';
import type { CadLabelSpec, CadLineSegment } from './cad_dimension_geometry.js';

/**
 * Per-viewport CAD ruler rendering: world-space dual-pass lines plus sharp DOM
 * labels. Geometry is shared via uploaded segment lists from CadRulerSystem.
 * Dashed batches hold blue size-dimension wings; solid batches hold gray
 * extension legs and drag-delta strokes.
 */
export class CadRulerViewport {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private solidDimensionBatch: CadRulerLineBatch;
  private dashedDimensionBatch: CadRulerLineBatch;
  private ghostBatch: CadRulerLineBatch;
  private labelLayer: CadRulerLabelLayer;
  private isDisposed: boolean;
  private scratchSolidSegments: CadLineSegment[];
  private scratchDashedSegments: CadLineSegment[];

  /**
   * Creates ruler rendering for one viewport.
   *
   * @param scene Viewport scene that receives line groups.
   * @param camera Viewport camera for label projection.
   * @param renderer Shared workspace renderer (legacy metrics fallback).
   * @param container Pane content element for label overlay and CSS size.
   */
  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, container: HTMLElement) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.container = container;
    this.solidDimensionBatch = new CadRulerLineBatch(
      'cad_ruler_dimensions_solid',
      CadRulerStyle.lineFrontOpacity,
      CadRulerStyle.lineOccludedOpacity,
    );
    this.dashedDimensionBatch = new CadRulerLineBatch(
      'cad_ruler_dimensions_dashed',
      CadRulerStyle.lineFrontOpacity,
      CadRulerStyle.lineOccludedOpacity,
      { dashed: true },
    );
    this.ghostBatch = new CadRulerLineBatch(
      'cad_ruler_ghost',
      CadRulerStyle.ghostFrontOpacity,
      CadRulerStyle.ghostOccludedOpacity,
    );
    this.labelLayer = new CadRulerLabelLayer(container);
    this.isDisposed = false;
    this.scratchSolidSegments = [];
    this.scratchDashedSegments = [];
    this.scene.add(this.solidDimensionBatch.getObject());
    this.scene.add(this.dashedDimensionBatch.getObject());
    this.scene.add(this.ghostBatch.getObject());
    this.setGeometryVisible(false);
  }

  /**
   * Uploads dimension segments and refreshes screen-space labels. Dashed size
   * wings and solid extension/delta strokes are split into separate batches.
   *
   * @param segments Dimension and extension line segments.
   * @param labels Label specifications.
   */
  setDimensions(segments: CadLineSegment[], labels: CadLabelSpec[]): void {
    if (this.isDisposed) return;
    this.partitionDimensionSegments(segments);
    this.solidDimensionBatch.setSegments(this.scratchSolidSegments);
    this.dashedDimensionBatch.setSegments(this.scratchDashedSegments);
    this.labelLayer.update(labels, this.camera);
    this.solidDimensionBatch.setVisible(false);
    this.dashedDimensionBatch.setVisible(false);
  }

  /**
   * Uploads ghost bounds wireframe segments.
   *
   * @param segments Ghost wire segments.
   */
  setGhost(segments: CadLineSegment[]): void {
    if (this.isDisposed) return;
    this.ghostBatch.setSegments(segments);
    this.ghostBatch.setVisible(false);
  }

  /**
   * Shows or hides world-space ruler line batches for multi-view isolation. DOM
   * labels stay on this pane's overlay and are unaffected.
   *
   * @param visible Whether this pane's 3D ruler geometry should draw.
   */
  setGeometryVisible(visible: boolean): void {
    if (this.isDisposed) return;
    const hasSolid = this.solidDimensionBatch.getSegmentCount() > 0;
    const hasDashed = this.dashedDimensionBatch.getSegmentCount() > 0;
    const hasGhost = this.ghostBatch.getSegmentCount() > 0;
    this.solidDimensionBatch.setVisible(visible && hasSolid);
    this.dashedDimensionBatch.setVisible(visible && hasDashed);
    this.ghostBatch.setVisible(visible && hasGhost);
  }

  /**
   * Enables dual-pass depth darkening for perspective panes, or full-bright
   * always-on-top lines for orthographic 2D panes.
   *
   * @param enabled True for 3D occlusion; false for 2D clarity.
   */
  setDepthOcclusionEnabled(enabled: boolean): void {
    if (this.isDisposed) return;
    this.solidDimensionBatch.setDepthOcclusionEnabled(enabled);
    this.dashedDimensionBatch.setDepthOcclusionEnabled(enabled);
    this.ghostBatch.setDepthOcclusionEnabled(enabled);
  }

  /**
   * Returns whether depth occlusion is enabled on dimension lines (tests).
   *
   * @returns True when dual-pass depth testing is active.
   */
  isDepthOcclusionEnabled(): boolean {
    return this.solidDimensionBatch.isDepthOcclusionEnabled();
  }

  /**
   * Reprojects existing labels after camera motion without rebuilding lines.
   *
   * @param labels Current label specifications.
   */
  refreshLabels(labels: CadLabelSpec[]): void {
    if (this.isDisposed) return;
    this.labelLayer.update(labels, this.camera);
  }

  /** Hides dimension lines, ghost, and labels. */
  clear(): void {
    this.solidDimensionBatch.clear();
    this.dashedDimensionBatch.clear();
    this.ghostBatch.clear();
    this.labelLayer.clear();
  }

  /**
   * Returns total dimension segment count for tests (solid + dashed).
   *
   * @returns Segment count.
   */
  getDimensionSegmentCount(): number {
    return this.solidDimensionBatch.getSegmentCount() + this.dashedDimensionBatch.getSegmentCount();
  }

  /**
   * Returns dashed dimension segment count for tests.
   *
   * @returns Dashed segment count.
   */
  getDashedDimensionSegmentCount(): number {
    return this.dashedDimensionBatch.getSegmentCount();
  }

  /**
   * Returns solid dimension segment count for tests.
   *
   * @returns Solid segment count.
   */
  getSolidDimensionSegmentCount(): number {
    return this.solidDimensionBatch.getSegmentCount();
  }

  /**
   * Returns whether the dashed dimension batch uses the screen-pixel dash
   * shader (tests).
   *
   * @returns True when dashed mode is active.
   */
  isDimensionStrokeDashed(): boolean {
    return this.dashedDimensionBatch.isDashed();
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
    this.scene.remove(this.solidDimensionBatch.getObject());
    this.scene.remove(this.dashedDimensionBatch.getObject());
    this.scene.remove(this.ghostBatch.getObject());
    this.solidDimensionBatch.dispose();
    this.dashedDimensionBatch.dispose();
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

  /**
   * Returns the pane content element used for label overlay and CSS metrics.
   *
   * @returns Content host element.
   */
  getContainer(): HTMLElement {
    return this.container;
  }

  /**
   * Returns the pane content CSS height used for world-per-pixel stand-off.
   *
   * @returns Height in CSS pixels (at least 1).
   */
  getViewportCssHeight(): number {
    return Math.max(1, this.container.clientHeight || 1);
  }

  /**
   * Splits mixed dimension geometry into solid and dashed scratch lists without
   * allocating new arrays each upload.
   *
   * @param segments Mixed solid and dashed segments from the ruler system.
   */
  private partitionDimensionSegments(segments: CadLineSegment[]): void {
    this.scratchSolidSegments.length = 0;
    this.scratchDashedSegments.length = 0;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue;
      if (segment.dashed) {
        this.scratchDashedSegments.push(segment);
      } else {
        this.scratchSolidSegments.push(segment);
      }
    }
  }
}
