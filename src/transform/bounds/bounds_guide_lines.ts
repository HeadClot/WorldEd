import * as THREE from 'three';
import { Theme } from '../../theme.js';
import { GizmoVisualStyle } from '../gizmo/gizmo_visual_style.js';
import type { CadViewPlane } from '../../rulers/cad_view_plane.js';
import {
  createBoundsGuideFrontLineMaterial,
  createBoundsGuideOccludedLineMaterial,
} from './bounds_guide_line_material.js';
import {
  isBoundsGuideAxisDrawnInView,
  resolveBoundsGuideRay,
  transformGuideRayToWorld,
  type BoundsGuideAxis,
} from './bounds_guide_visibility.js';

/** Options controlling which corner guide rays are built. */
export interface BoundsGuideLineBuildOptions {
  /** Viewport plane; orthographic depth axes are omitted. */
  viewPlane?: CadViewPlane;
  /** World center of the oriented bounds. */
  boundsCenter?: THREE.Vector3;
  /** World orientation of the oriented bounds. */
  boundsQuaternion?: THREE.Quaternion;
  /** Content meshes for 3D triangle tests (perspective). */
  raycastMeshes?: readonly THREE.Mesh[];
  /** Precomputed world AABBs for fast planar tests (orthographic). */
  planarWorldBoxes?: readonly THREE.Box3[];
}

/** Flat attribute arrays accumulated while building guide rays. */
interface GuideRayBuffers {
  positions: number[];
  colors: number[];
  lineDistances: number[];
}

/**
 * Draws RGB axis guide rays from each corner of an oriented bounds box. Rays
 * use a GPU dashed shader with screen-space dash length (via fwidth) so zoom
 * does not change dash size in 2D or 3D. Individual rays are only emitted when
 * they can reach the ground plane (perspective) or scene geometry, and
 * orthographic views never draw the depth axis.
 */
export class BoundsGuideLines {
  private rootGroup: THREE.Group;
  private geometry: THREE.BufferGeometry;
  private frontMaterial: THREE.ShaderMaterial;
  private occludedMaterial: THREE.ShaderMaterial;
  private frontLines: THREE.LineSegments;
  private occludedLines: THREE.LineSegments;
  private fixedGuideLength: number;
  private colorX: THREE.Color;
  private colorY: THREE.Color;
  private colorZ: THREE.Color;
  private readonly cornerSigns: ReadonlyArray<number>;

  /**
   * Creates guide-line geometry using theme axis colors.
   *
   * @param theme Theme providing gizmo axis colors.
   * @param fixedGuideLength Constant outward ray length in world units.
   */
  constructor(theme: typeof Theme, fixedGuideLength: number = 4) {
    this.fixedGuideLength = fixedGuideLength;
    this.colorX = new THREE.Color(theme.gizmoXAxisColor);
    this.colorY = new THREE.Color(theme.gizmoYAxisColor);
    this.colorZ = new THREE.Color(theme.gizmoZAxisColor);
    this.cornerSigns = [-1, 1];
    this.geometry = new THREE.BufferGeometry();
    this.frontMaterial = createBoundsGuideFrontLineMaterial();
    this.occludedMaterial = createBoundsGuideOccludedLineMaterial();
    this.frontLines = this.createFrontLineSegments();
    this.occludedLines = this.createOccludedLineSegments();
    this.rootGroup = this.createRootGroup();
    this.allocateEmptyGeometry();
  }

  /**
   * Builds the front LineSegments with standard gizmo depth testing.
   *
   * @returns Configured front line object.
   */
  private createFrontLineSegments(): THREE.LineSegments {
    const lines = new THREE.LineSegments(this.geometry, this.frontMaterial);
    lines.name = 'bounds_guide_lines_front';
    lines.renderOrder = GizmoVisualStyle.frontRenderOrder;
    lines.frustumCulled = false;
    return lines;
  }

  /**
   * Builds the occluded ghost LineSegments sharing the front geometry.
   *
   * @returns Configured occluded line object.
   */
  private createOccludedLineSegments(): THREE.LineSegments {
    const lines = new THREE.LineSegments(this.geometry, this.occludedMaterial);
    lines.name = 'bounds_guide_lines_occluded';
    lines.renderOrder = GizmoVisualStyle.occludedRenderOrder;
    lines.frustumCulled = false;
    lines.userData['isGizmoOccludedGhost'] = true;
    return lines;
  }

  /**
   * Builds the parent group containing front and occluded line passes.
   *
   * @returns Root group for parenting under the bounds gizmo.
   */
  private createRootGroup(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'bounds_guide_lines';
    group.userData['isBoundsGuideLines'] = true;
    group.visible = false;
    group.add(this.occludedLines);
    group.add(this.frontLines);
    return group;
  }

  /** Allocates zero-length buffers until the first bounds update. */
  private allocateEmptyGeometry(): void {
    this.applyBuffers(this.createEmptyBuffers());
  }

  /**
   * Creates empty attribute arrays for guide ray geometry.
   *
   * @returns Empty buffer set.
   */
  private createEmptyBuffers(): GuideRayBuffers {
    return { positions: [], colors: [], lineDistances: [] };
  }

  /**
   * Returns the root group to parent under the bounds gizmo root.
   *
   * @returns The guide lines group containing front and occluded passes.
   */
  getObject(): THREE.Group {
    return this.rootGroup;
  }

  /**
   * Returns the shared guide-line geometry for inspection and tests.
   *
   * @returns The buffer geometry used by both line passes.
   */
  getGeometry(): THREE.BufferGeometry {
    return this.geometry;
  }

  /**
   * Shows or hides the guide lines.
   *
   * @param visible Whether the lines should be drawn.
   */
  setVisible(visible: boolean): void {
    this.rootGroup.visible = visible;
  }

  /**
   * Returns whether the guide lines are currently visible.
   *
   * @returns True when visible.
   */
  isVisible(): boolean {
    return this.rootGroup.visible;
  }

  /**
   * Rebuilds guide rays for the given local half extents. Only rays that pass
   * viewport visibility rules are written into the geometry.
   *
   * @param halfExtents Local half extents of the oriented bounds.
   * @param options Optional viewport and raycast context for filtering.
   */
  updateFromHalfExtents(halfExtents: THREE.Vector3, options: BoundsGuideLineBuildOptions = {}): void {
    const buffers = this.createEmptyBuffers();
    this.appendAllCornerGuides(buffers, halfExtents, options);
    this.applyBuffers(buffers);
  }

  /**
   * Writes filtered guide rays into an existing geometry (viewport clones).
   * Creates a temporary builder so theme colors match the master gizmo.
   *
   * @param geometry Geometry to replace attributes on (owned by the caller).
   * @param halfExtents Local half extents of the oriented bounds.
   * @param theme Theme for axis colors.
   * @param fixedGuideLength Authored ray length.
   * @param options Viewport and raycast context for filtering.
   */
  static writeFilteredGeometry(
    geometry: THREE.BufferGeometry,
    halfExtents: THREE.Vector3,
    theme: typeof Theme,
    fixedGuideLength: number,
    options: BoundsGuideLineBuildOptions,
  ): void {
    const builder = new BoundsGuideLines(theme, fixedGuideLength);
    builder.updateFromHalfExtents(halfExtents, options);
    copyGuideGeometryAttributes(builder.getGeometry(), geometry);
    geometry.computeBoundingSphere();
    builder.dispose();
  }

  /**
   * Appends outward X/Y/Z rays for every box corner that passes visibility.
   *
   * @param buffers Attribute accumulators.
   * @param halfExtents Local half extents.
   * @param options Visibility context.
   */
  private appendAllCornerGuides(
    buffers: GuideRayBuffers,
    halfExtents: THREE.Vector3,
    options: BoundsGuideLineBuildOptions,
  ): void {
    this.cornerSigns.forEach((signX) => {
      this.cornerSigns.forEach((signY) => {
        this.cornerSigns.forEach((signZ) => {
          this.appendCornerAxisRays(buffers, halfExtents, this.fixedGuideLength, signX, signY, signZ, options);
        });
      });
    });
  }

  /**
   * Appends visible outward axis rays for one corner.
   *
   * @param buffers Attribute accumulators.
   * @param halfExtents Local half extents.
   * @param length Outward ray length.
   * @param signX Corner sign on X (-1 or 1).
   * @param signY Corner sign on Y (-1 or 1).
   * @param signZ Corner sign on Z (-1 or 1).
   * @param options Visibility context.
   */
  private appendCornerAxisRays(
    buffers: GuideRayBuffers,
    halfExtents: THREE.Vector3,
    length: number,
    signX: number,
    signY: number,
    signZ: number,
    options: BoundsGuideLineBuildOptions,
  ): void {
    const cornerX = signX * halfExtents.x;
    const cornerY = signY * halfExtents.y;
    const cornerZ = signZ * halfExtents.z;
    this.tryAppendAxisRay(buffers, cornerX, cornerY, cornerZ, 'x', signX, length, this.colorX, options);
    this.tryAppendAxisRay(buffers, cornerX, cornerY, cornerZ, 'y', signY, length, this.colorY, options);
    this.tryAppendAxisRay(buffers, cornerX, cornerY, cornerZ, 'z', signZ, length, this.colorZ, options);
  }

  /**
   * Appends one axis ray when viewport rules allow it.
   *
   * @param buffers Attribute accumulators.
   * @param cornerX Corner X.
   * @param cornerY Corner Y.
   * @param cornerZ Corner Z.
   * @param axis Axis of the ray.
   * @param sign Outward sign along the axis.
   * @param length Ray length.
   * @param color Axis color.
   * @param options Visibility context.
   */
  private tryAppendAxisRay(
    buffers: GuideRayBuffers,
    cornerX: number,
    cornerY: number,
    cornerZ: number,
    axis: BoundsGuideAxis,
    sign: number,
    length: number,
    color: THREE.Color,
    options: BoundsGuideLineBuildOptions,
  ): void {
    const fullEndX = cornerX + (axis === 'x' ? sign * length : 0);
    const fullEndY = cornerY + (axis === 'y' ? sign * length : 0);
    const fullEndZ = cornerZ + (axis === 'z' ? sign * length : 0);
    const clipped = this.resolveClippedLocalEnd(
      cornerX,
      cornerY,
      cornerZ,
      fullEndX,
      fullEndY,
      fullEndZ,
      axis,
      length,
      options,
    );
    if (!clipped) return;
    this.appendRay(buffers, cornerX, cornerY, cornerZ, clipped.endX, clipped.endY, clipped.endZ, color);
  }

  /**
   * Resolves the local end point of a guide ray after visibility and clip
   * tests.
   *
   * @param ax Start X.
   * @param ay Start Y.
   * @param az Start Z.
   * @param bx Full-length end X.
   * @param by Full-length end Y.
   * @param bz Full-length end Z.
   * @param axis Axis of the ray.
   * @param fullLength Authored ray length.
   * @param options Visibility context.
   * @returns Clipped local end, or null when the ray is hidden.
   */
  private resolveClippedLocalEnd(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    axis: BoundsGuideAxis,
    fullLength: number,
    options: BoundsGuideLineBuildOptions,
  ): { endX: number; endY: number; endZ: number } | null {
    const viewPlane = options.viewPlane ?? 'xyz';
    if (options.boundsCenter === undefined) {
      if (!isBoundsGuideAxisDrawnInView(axis, viewPlane)) return null;
      return { endX: bx, endY: by, endZ: bz };
    }
    const quaternion = options.boundsQuaternion ?? new THREE.Quaternion();
    const worldRay = transformGuideRayToWorld(
      new THREE.Vector3(ax, ay, az),
      new THREE.Vector3(bx, by, bz),
      options.boundsCenter,
      quaternion,
    );
    const resolution = resolveBoundsGuideRay({
      viewPlane,
      axis,
      worldOrigin: worldRay.origin,
      worldDirection: worldRay.direction,
      length: worldRay.length,
      ...(options.raycastMeshes ? { raycastMeshes: options.raycastMeshes } : {}),
      ...(options.planarWorldBoxes ? { planarWorldBoxes: options.planarWorldBoxes } : {}),
    });
    if (!resolution.show || resolution.drawLength <= 1e-8) return null;
    const scale = fullLength > 1e-12 ? resolution.drawLength / fullLength : 0;
    return {
      endX: ax + (bx - ax) * scale,
      endY: ay + (by - ay) * scale,
      endZ: az + (bz - az) * scale,
    };
  }

  /**
   * Appends one solid-color dashed ray. lineDistance is 0 at the tip and the
   * segment length at the corner so a full dash lands on the hit target.
   *
   * @param buffers Attribute accumulators.
   * @param ax Corner X.
   * @param ay Corner Y.
   * @param az Corner Z.
   * @param bx Tip X.
   * @param by Tip Y.
   * @param bz Tip Z.
   * @param color Axis color for both endpoints.
   */
  private appendRay(
    buffers: GuideRayBuffers,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    color: THREE.Color,
  ): void {
    const length = Math.hypot(bx - ax, by - ay, bz - az);
    buffers.positions.push(ax, ay, az, bx, by, bz);
    this.pushSolidColor(buffers.colors, color);
    this.pushSolidColor(buffers.colors, color);
    // Tip = 0, corner = length → tip-aligned screen dashes via fwidth.
    buffers.lineDistances.push(length, 0);
  }

  /**
   * Pushes a full-intensity RGB triple.
   *
   * @param colors Color component accumulator.
   * @param color Source color.
   */
  private pushSolidColor(colors: number[], color: THREE.Color): void {
    colors.push(color.r, color.g, color.b);
  }

  /**
   * Writes guide ray attribute arrays into the shared line geometry.
   *
   * @param buffers Flat attribute component arrays.
   */
  private applyBuffers(buffers: GuideRayBuffers): void {
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
    this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
    this.geometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute(buffers.lineDistances, 1));
    this.geometry.computeBoundingSphere();
  }

  /**
   * Returns the number of line segments currently stored.
   *
   * @returns Segment count (two vertices per segment).
   */
  getSegmentCount(): number {
    const position = this.geometry.getAttribute('position');
    if (!position) return 0;
    return Math.floor(position.count / 2);
  }

  /** Disposes GPU resources held by the guide lines. */
  dispose(): void {
    this.geometry.dispose();
    this.frontMaterial.dispose();
    this.occludedMaterial.dispose();
  }
}

/**
 * Copies all guide-ray attributes from a source geometry onto a target.
 *
 * @param source Geometry built by a temporary BoundsGuideLines.
 * @param target Geometry owned by a viewport clone.
 */
function copyGuideGeometryAttributes(source: THREE.BufferGeometry, target: THREE.BufferGeometry): void {
  const names = ['position', 'color', 'lineDistance'] as const;
  names.forEach((name) => {
    const attribute = source.getAttribute(name);
    if (attribute) target.setAttribute(name, attribute.clone());
  });
}
