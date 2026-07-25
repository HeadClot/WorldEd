import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  appendCadDimension,
  appendGhostBoxSegments,
  appendResizeSizeDeltaDimensions,
  appendSelectionSizeDimensions,
  appendTransformDeltaDimensions,
  placeCameraFacingMeasuredEdge,
  resolveCadOffsetScale,
  extractBoundsAxes,
  type CadLabelSpec,
  type CadLineSegment,
} from '../../src/rulers/cad_dimension_geometry.js';
import { createFixedCadPlacementContext } from '../../src/rulers/cad_placement_context.js';
import type { OrientedBoundsData } from '../../src/transform/bounds/oriented_bounds.js';

/**
 * Builds an axis-aligned unit-centered bounds with the given half extents.
 *
 * @param halfX Half size on X.
 * @param halfY Half size on Y.
 * @param halfZ Half size on Z.
 * @returns Oriented bounds data.
 */
function makeBounds(halfX: number, halfY: number, halfZ: number): OrientedBoundsData {
  return {
    center: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(),
    halfExtents: new THREE.Vector3(halfX, halfY, halfZ),
  };
}

/**
 * Builds bounds with an explicit center.
 *
 * @param center World center.
 * @param halfX Half size on X.
 * @param halfY Half size on Y.
 * @param halfZ Half size on Z.
 * @returns Oriented bounds data.
 */
function makeBoundsAt(center: THREE.Vector3, halfX: number, halfY: number, halfZ: number): OrientedBoundsData {
  return {
    center: center.clone(),
    quaternion: new THREE.Quaternion(),
    halfExtents: new THREE.Vector3(halfX, halfY, halfZ),
  };
}

/**
 * Creates a perspective camera looking at the origin from a given eye point.
 *
 * @param eye Camera position.
 * @returns Configured camera.
 */
function makeCamera(eye: THREE.Vector3): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.copy(eye);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

describe('cad_dimension_geometry', () => {
  it('should keep offset scale small even when one axis is huge', () => {
    const hugeX = resolveCadOffsetScale(new THREE.Vector3(50, 1, 1));
    const unit = resolveCadOffsetScale(new THREE.Vector3(1, 1, 1));
    expect(hugeX).toBeLessThan(0.5);
    expect(Math.abs(hugeX - unit)).toBeLessThan(0.25);
  });

  it('should extract orthonormal world axes from identity bounds (Y-up)', () => {
    const axisX = new THREE.Vector3();
    const axisY = new THREE.Vector3();
    const axisZ = new THREE.Vector3();
    extractBoundsAxes(makeBounds(1, 1, 1), axisX, axisY, axisZ);
    expect(axisX.distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-6);
    expect(axisY.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-6);
    expect(axisZ.distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-6);
  });

  it('should create twelve ghost box edges for any bounds size', () => {
    const segments: CadLineSegment[] = [];
    appendGhostBoxSegments(makeBounds(2, 3, 4), new THREE.Color(0xffffff), segments);
    expect(segments).toHaveLength(12);
  });

  it('should build size dimensions with labels matching full extents', () => {
    const segments: CadLineSegment[] = [];
    const labels: CadLabelSpec[] = [];
    const placement = createFixedCadPlacementContext(makeCamera(new THREE.Vector3(5, 5, 5)), 0.15);
    appendSelectionSizeDimensions(
      makeBounds(1, 2, 3),
      new THREE.Color(0x5ec8ff),
      new THREE.Color(0x8a9aaa),
      '#9ee0ff',
      segments,
      labels,
      placement,
    );
    expect(segments.length).toBeGreaterThan(9);
    const texts = labels.map((label) => label.text).sort();
    expect(texts).toContain('2');
    expect(texts).toContain('4');
    expect(texts).toContain('6');
  });

  it('should place size dimensions on the camera-facing side of the box', () => {
    const labels: CadLabelSpec[] = [];
    // Camera above and in +Z/+X — X size should not sink far below the box.
    const placement = createFixedCadPlacementContext(makeCamera(new THREE.Vector3(4, 6, 4)), 0.15);
    appendSelectionSizeDimensions(
      makeBounds(1, 1, 1),
      new THREE.Color(0x5ec8ff),
      new THREE.Color(0x8a9aaa),
      '#9ee0ff',
      [],
      labels,
      placement,
    );
    const sizeX = labels.find((label) => label.id === 'size-x');
    expect(sizeX).toBeDefined();
    // Stand-off is fixed 0.15; label should stay near the solid, not fly to y=-10.
    expect(Math.abs(sizeX!.worldPosition.y)).toBeLessThan(3);
  });

  it('should place the measured edge on the side the camera is looking at', () => {
    const bounds = makeBounds(1, 1, 1);
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const outward = new THREE.Vector3();
    placeCameraFacingMeasuredEdge(bounds, 0, makeCamera(new THREE.Vector3(0, 5, 0)), start, end, outward, 'xyz');
    // Looking from above → edge on the +Y (top) half.
    expect((start.y + end.y) * 0.5).toBeGreaterThan(0);
    placeCameraFacingMeasuredEdge(bounds, 0, makeCamera(new THREE.Vector3(0, -5, 0)), start, end, outward, 'xyz');
    // Looking from below → edge on the -Y (bottom) half.
    expect((start.y + end.y) * 0.5).toBeLessThan(0);
  });

  it('should place front-facing edges when looking from +Z', () => {
    const bounds = makeBounds(1, 1, 1);
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const outward = new THREE.Vector3();
    placeCameraFacingMeasuredEdge(bounds, 0, makeCamera(new THREE.Vector3(0, 0, 5)), start, end, outward, 'xyz');
    expect((start.z + end.z) * 0.5).toBeGreaterThan(0);
  });

  it('should move the ruler to the top edge when looking up from the ground', () => {
    // Unit box centered at origin: y from -1 to 1. Eye at ground-front looking at top-front.
    const bounds = makeBounds(1, 1, 1);
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const outward = new THREE.Vector3();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, -1, 4);
    camera.lookAt(0, 1, 1);
    camera.updateMatrixWorld(true);
    placeCameraFacingMeasuredEdge(bounds, 0, camera, start, end, outward, 'xyz');
    // Looking at the top-front region → edge should be on +Y, not the ground (-Y).
    expect((start.y + end.y) * 0.5).toBeGreaterThan(0.5);
  });

  it('should offset top-view X dimensions in the XZ plane (not along depth Y)', () => {
    const bounds = makeBounds(1, 1, 1);
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const outward = new THREE.Vector3();
    const camera = makeCamera(new THREE.Vector3(0, 10, 0));
    placeCameraFacingMeasuredEdge(bounds, 0, camera, start, end, outward, 'xz');
    expect(Math.abs(outward.y)).toBeLessThan(0.25);
    expect(Math.abs(outward.z) + Math.abs(outward.x)).toBeGreaterThan(0.75);
  });

  it('should place top-view X dimension outside the solid', () => {
    const labels: CadLabelSpec[] = [];
    const placement = createFixedCadPlacementContext(makeCamera(new THREE.Vector3(0, 10, 0)), 0.2, 'xz');
    appendSelectionSizeDimensions(
      makeBounds(1, 1, 1),
      new THREE.Color(0x5ec8ff),
      new THREE.Color(0x8a9aaa),
      '#9ee0ff',
      [],
      labels,
      placement,
    );
    const sizeX = labels.find((label) => label.id === 'size-x');
    expect(sizeX).toBeDefined();
    expect(Math.abs(sizeX!.worldPosition.z)).toBeGreaterThan(1.05);
  });

  it('should hide Y size labels in top view', () => {
    const labels: CadLabelSpec[] = [];
    const placement = createFixedCadPlacementContext(makeCamera(new THREE.Vector3(0, 10, 0)), 0.15, 'xz');
    appendSelectionSizeDimensions(
      makeBounds(1, 1, 1),
      new THREE.Color(0x5ec8ff),
      new THREE.Color(0x8a9aaa),
      '#9ee0ff',
      [],
      labels,
      placement,
    );
    const ids = labels.map((label) => label.id);
    expect(ids).toContain('size-x');
    expect(ids).toContain('size-z');
    expect(ids).not.toContain('size-y');
  });

  it('should connect extension legs to the measured edge when gap is zero', () => {
    const segments: CadLineSegment[] = [];
    const placement = createFixedCadPlacementContext(makeCamera(new THREE.Vector3(0, 5, 0)), 0.2);
    placement.gapWorld = 0;
    appendCadDimension(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(4, 0, 0),
      new THREE.Vector3(0, 1, 0),
      placement,
      new THREE.Color(0xffffff),
      new THREE.Color(0xaaaaaa),
      'test',
      '4',
      '#fff',
      0,
      segments,
      [],
    );
    // First extension starts at the measured point (connected).
    expect(segments[0].ax).toBeCloseTo(0, 5);
    expect(segments[0].ay).toBeCloseTo(0, 5);
    expect(segments[0].az).toBeCloseTo(0, 5);
  });

  it('should keep stand-off independent of measured length when placement is fixed', () => {
    const shortLabels: CadLabelSpec[] = [];
    const longLabels: CadLabelSpec[] = [];
    const placement = createFixedCadPlacementContext(makeCamera(new THREE.Vector3(0, 8, 0)), 0.2);
    appendSelectionSizeDimensions(
      makeBounds(1, 1, 1),
      new THREE.Color(0x5ec8ff),
      new THREE.Color(0x8a9aaa),
      '#9ee0ff',
      [],
      shortLabels,
      placement,
    );
    appendSelectionSizeDimensions(
      makeBounds(20, 1, 1),
      new THREE.Color(0x5ec8ff),
      new THREE.Color(0x8a9aaa),
      '#9ee0ff',
      [],
      longLabels,
      placement,
    );
    const shortX = shortLabels.find((label) => label.id === 'size-x')!;
    const longX = longLabels.find((label) => label.id === 'size-x')!;
    // Same camera-facing Y face and fixed stand-off → same label Y.
    expect(longX.worldPosition.y).toBeCloseTo(shortX.worldPosition.y, 4);
  });

  it('should omit zero-length size axes', () => {
    const labels: CadLabelSpec[] = [];
    const placement = createFixedCadPlacementContext(makeCamera(new THREE.Vector3(5, 5, 5)), 0.15);
    appendSelectionSizeDimensions(
      makeBounds(1, 0, 1),
      new THREE.Color(0x5ec8ff),
      new THREE.Color(0x8a9aaa),
      '#9ee0ff',
      [],
      labels,
      placement,
    );
    expect(labels.map((label) => label.text)).not.toContain('0');
    expect(labels.length).toBe(2);
  });

  it('should build drag delta dimensions only on moved axes without a total label', () => {
    const labels: CadLabelSpec[] = [];
    const placement = createFixedCadPlacementContext(makeCamera(new THREE.Vector3(5, 5, 5)), 0.15);
    const start = makeBounds(1, 1, 1);
    const current = {
      center: new THREE.Vector3(2, 0, 0),
      quaternion: new THREE.Quaternion(),
      halfExtents: new THREE.Vector3(1, 1, 1),
    };
    appendTransformDeltaDimensions(
      start,
      current,
      new THREE.Color(0xe86a17),
      {
        x: new THREE.Color(0xff0000),
        y: new THREE.Color(0x00ff00),
        z: new THREE.Color(0x0000ff),
      },
      new THREE.Color(0x888888),
      '#ffb070',
      0,
      [],
      labels,
      placement,
    );
    expect(labels.some((label) => label.id === 'delta-x')).toBe(true);
    expect(labels.some((label) => label.id === 'delta-y')).toBe(false);
    expect(labels.some((label) => label.id === 'delta-z')).toBe(false);
    expect(labels.some((label) => label.id === 'delta-total')).toBe(false);
    expect(labels.filter((label) => label.id.startsWith('delta-'))).toHaveLength(1);
  });

  it('should place +X travel on the trailing (left) face', () => {
    const segments: CadLineSegment[] = [];
    const labels: CadLabelSpec[] = [];
    const placement = createFixedCadPlacementContext(makeCamera(new THREE.Vector3(5, 5, 5)), 0.15);
    const start = makeBounds(1, 1, 1);
    const current = {
      center: new THREE.Vector3(0.25, 0, 0),
      quaternion: new THREE.Quaternion(),
      halfExtents: new THREE.Vector3(1, 1, 1),
    };
    appendTransformDeltaDimensions(
      start,
      current,
      new THREE.Color(0xe86a17),
      {
        x: new THREE.Color(0xff0000),
        y: new THREE.Color(0x00ff00),
        z: new THREE.Color(0x0000ff),
      },
      new THREE.Color(0x888888),
      '#ffb070',
      0,
      segments,
      labels,
      placement,
    );
    const delta = labels.find((label) => label.id === 'delta-x');
    expect(delta).toBeDefined();
    // Trailing face at x = center - halfX: start -1 → current -0.75; midpoint ≈ -0.875
    expect(delta!.worldPosition.x).toBeLessThan(0);
  });

  it('should only report face travel on the resized axis for one-sided X resize', () => {
    const start = makeBoundsAt(new THREE.Vector3(0, 0, 0), 1, 1, 1);
    const current = makeBoundsAt(new THREE.Vector3(1, 0, 0), 2, 1, 1);
    const labels: CadLabelSpec[] = [];
    const placement = createFixedCadPlacementContext(makeCamera(new THREE.Vector3(5, 5, 5)), 0.15);
    appendResizeSizeDeltaDimensions(
      start,
      current,
      new THREE.Color(0xe86a17),
      new THREE.Color(0x888888),
      '#ffb070',
      [],
      labels,
      placement,
    );
    const ids = labels.map((label) => label.id);
    expect(ids.some((id) => id.startsWith('resize-pos-0') || id.startsWith('resize-neg-0'))).toBe(true);
    expect(ids.some((id) => id.includes('resize-pos-1') || id.includes('resize-neg-1'))).toBe(false);
    expect(ids.some((id) => id.includes('resize-pos-2') || id.includes('resize-neg-2'))).toBe(false);
  });

  it('should place dimension labels outward from the measured edge', () => {
    const labels: CadLabelSpec[] = [];
    const placement = createFixedCadPlacementContext(makeCamera(new THREE.Vector3(0, 5, 0)), 0.25);
    appendCadDimension(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(4, 0, 0),
      new THREE.Vector3(0, 1, 0),
      placement,
      new THREE.Color(0xffffff),
      new THREE.Color(0xaaaaaa),
      'test',
      '4',
      '#fff',
      0,
      [],
      labels,
    );
    expect(labels[0].worldPosition.x).toBeCloseTo(2, 5);
    expect(labels[0].worldPosition.y).toBeCloseTo(0.25, 5);
  });
});
