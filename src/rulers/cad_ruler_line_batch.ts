import * as THREE from 'three';
import { CadRulerStyle } from './cad_ruler_style.js';
import type { CadLineSegment } from './cad_dimension_geometry.js';

/**
 * Dual-pass (front + occluded) line batch for CAD ruler geometry. Rebuilds
 * buffers only when new segments are uploaded; cheap enough for per-frame
 * selection feedback.
 */
export class CadRulerLineBatch {
  private rootGroup: THREE.Group;
  private geometry: THREE.BufferGeometry;
  private frontMaterial: THREE.LineBasicMaterial;
  private occludedMaterial: THREE.LineBasicMaterial;
  private frontLines: THREE.LineSegments;
  private occludedLines: THREE.LineSegments;
  private positions: Float32Array;
  private colors: Float32Array;
  private capacityVertices: number;
  private usedVertices: number;

  /**
   * Creates an empty dual-pass line batch.
   *
   * @param name Root group name for debugging.
   * @param frontOpacity Front-pass opacity.
   * @param occludedOpacity Occluded-pass opacity.
   */
  constructor(
    name: string,
    frontOpacity: number = CadRulerStyle.lineFrontOpacity,
    occludedOpacity: number = CadRulerStyle.lineOccludedOpacity,
  ) {
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(0);
    this.colors = new Float32Array(0);
    this.capacityVertices = 0;
    this.usedVertices = 0;
    this.frontMaterial = this.createFrontMaterial(frontOpacity);
    this.occludedMaterial = this.createOccludedMaterial(occludedOpacity);
    this.frontLines = this.createLinePass('front', this.frontMaterial, CadRulerStyle.frontRenderOrder);
    this.occludedLines = this.createLinePass('occluded', this.occludedMaterial, CadRulerStyle.occludedRenderOrder);
    this.occludedLines.userData.isGizmoOccludedGhost = true;
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = name;
    this.rootGroup.userData.isCadRuler = true;
    this.rootGroup.frustumCulled = false;
    this.rootGroup.add(this.occludedLines);
    this.rootGroup.add(this.frontLines);
    this.clear();
  }

  /**
   * Returns the root group to parent in a viewport scene.
   *
   * @returns Root group containing both line passes.
   */
  getObject(): THREE.Group {
    return this.rootGroup;
  }

  /**
   * Shows or hides the entire batch.
   *
   * @param visible Whether lines should draw.
   */
  setVisible(visible: boolean): void {
    this.rootGroup.visible = visible;
  }

  /**
   * Returns whether the batch is visible.
   *
   * @returns True when visible.
   */
  isVisible(): boolean {
    return this.rootGroup.visible;
  }

  /**
   * Replaces geometry with the provided segments.
   *
   * @param segments World-space colored segments.
   */
  setSegments(segments: CadLineSegment[]): void {
    const vertexCount = segments.length * 2;
    this.ensureCapacity(vertexCount);
    this.writeSegments(segments);
    this.usedVertices = vertexCount;
    this.uploadAttributes(vertexCount);
    this.rootGroup.visible = segments.length > 0;
  }

  /** Clears all segments and hides the batch. */
  clear(): void {
    this.usedVertices = 0;
    this.uploadAttributes(0);
    this.rootGroup.visible = false;
  }

  /**
   * Returns the number of line segments currently stored.
   *
   * @returns Segment count.
   */
  getSegmentCount(): number {
    return Math.floor(this.usedVertices / 2);
  }

  /** Disposes GPU resources owned by this batch. */
  dispose(): void {
    this.geometry.dispose();
    this.frontMaterial.dispose();
    this.occludedMaterial.dispose();
  }

  /**
   * Creates the front-pass line material.
   *
   * @param opacity Front opacity.
   * @returns Configured material.
   */
  private createFrontMaterial(opacity: number): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      transparent: true,
      opacity,
      toneMapped: false,
      linewidth: 1,
    });
  }

  /**
   * Creates the occluded ghost line material.
   *
   * @param opacity Occluded opacity.
   * @returns Configured material.
   */
  private createOccludedMaterial(opacity: number): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      transparent: true,
      opacity,
      toneMapped: false,
      linewidth: 1,
    });
  }

  /**
   * Builds one LineSegments pass sharing the batch geometry.
   *
   * @param suffix Name suffix.
   * @param material Pass material.
   * @param renderOrder Draw order.
   * @returns Configured line object.
   */
  private createLinePass(suffix: string, material: THREE.LineBasicMaterial, renderOrder: number): THREE.LineSegments {
    const lines = new THREE.LineSegments(this.geometry, material);
    lines.name = `cad_ruler_lines_${suffix}`;
    lines.renderOrder = renderOrder;
    lines.frustumCulled = false;
    return lines;
  }

  /**
   * Grows typed arrays when the next upload needs more vertices.
   *
   * @param vertexCount Required vertex count.
   */
  private ensureCapacity(vertexCount: number): void {
    if (vertexCount <= this.capacityVertices) return;
    const nextCapacity = Math.max(vertexCount, Math.max(64, this.capacityVertices * 2));
    this.positions = new Float32Array(nextCapacity * 3);
    this.colors = new Float32Array(nextCapacity * 3);
    this.capacityVertices = nextCapacity;
  }

  /**
   * Copies segment endpoints and colors into flat arrays.
   *
   * @param segments Source segments.
   */
  private writeSegments(segments: CadLineSegment[]): void {
    let offset = 0;
    for (const segment of segments) {
      this.positions[offset] = segment.ax;
      this.positions[offset + 1] = segment.ay;
      this.positions[offset + 2] = segment.az;
      this.colors[offset] = segment.colorA.r;
      this.colors[offset + 1] = segment.colorA.g;
      this.colors[offset + 2] = segment.colorA.b;
      offset += 3;
      this.positions[offset] = segment.bx;
      this.positions[offset + 1] = segment.by;
      this.positions[offset + 2] = segment.bz;
      this.colors[offset] = segment.colorB.r;
      this.colors[offset + 1] = segment.colorB.g;
      this.colors[offset + 2] = segment.colorB.b;
      offset += 3;
    }
  }

  /**
   * Uploads position/color attributes for the used vertex range.
   *
   * @param vertexCount Used vertex count.
   */
  private uploadAttributes(vertexCount: number): void {
    const positionView = this.positions.subarray(0, vertexCount * 3);
    const colorView = this.colors.subarray(0, vertexCount * 3);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positionView, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colorView, 3));
    this.geometry.setDrawRange(0, vertexCount);
    this.geometry.computeBoundingSphere();
  }
}
