import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createSolidModelStartupDefault,
  SOLID_MODEL_STARTUP_DEFAULT_BRUSH_SIZE,
} from '@/solid/model/solid_model_startup_default.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { formatHierarchyHexIndex, hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import {
  getDefaultFrontCameraPosition,
  getDefaultSceneFocus,
  getDefaultSideCameraPosition,
} from '@/navigation/placement/default_camera_placement.js';

/** Startup solid model must sit at the world origin with a unit brush!. */
describe('createSolidModelStartupDefault', () => {
  it('creates a solid model with one additive unit brush at the origin', () => {
    hierarchyNameAllocator.reset();
    const model = createSolidModelStartupDefault();
    expect(SolidModel.isSolidModelObject(model.root)).toBe(true);
    expect(model.root.name).toBe(`DefaultModel.${formatHierarchyHexIndex(1)}`);
    expect(model.getBrushCount()).toBe(1);
    expect(SOLID_MODEL_STARTUP_DEFAULT_BRUSH_SIZE).toBe(1);
    const brush = model.getBrushes()[0]!;
    expect(brush.name).toBe(`Brush.${formatHierarchyHexIndex(2)}`);
    expect(brush.mesh!.name).toBe(brush.name);
    expect(brush.operation).toBe(SolidOperation.Additive);
    expect(brush.position.x).toBeCloseTo(0, 5);
    expect(brush.position.y).toBeCloseTo(0, 5);
    expect(brush.position.z).toBeCloseTo(0, 5);
    expect(model.root.position.x).toBeCloseTo(0, 5);
    expect(model.root.position.y).toBeCloseTo(0, 5);
    expect(model.root.position.z).toBeCloseTo(0, 5);
  });

  it('builds result geometry centered on the origin with unit bounds', () => {
    const model = createSolidModelStartupDefault();
    const result = model.getResultMesh();
    expect(result.parent).toBe(model.root);
    result.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(result);
    expect(box.min.y).toBeCloseTo(-0.5, 4);
    expect(box.max.y).toBeCloseTo(0.5, 4);
    expect(box.max.x - box.min.x).toBeCloseTo(1, 4);
    expect(box.max.z - box.min.z).toBeCloseTo(1, 4);
    const center = box.getCenter(new THREE.Vector3());
    expect(center.x).toBeCloseTo(0, 4);
    expect(center.y).toBeCloseTo(0, 4);
    expect(center.z).toBeCloseTo(0, 4);
  });

  it('keeps the result center aligned with default camera focus at origin', () => {
    const model = createSolidModelStartupDefault();
    const result = model.getResultMesh();
    result.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(result).getCenter(new THREE.Vector3());
    const focus = getDefaultSceneFocus();
    expect(center.x).toBeCloseTo(focus.x, 4);
    expect(center.y).toBeCloseTo(focus.y, 4);
    expect(center.z).toBeCloseTo(focus.z, 4);
    expect(focus.x).toBe(0);
    expect(focus.y).toBe(0);
    expect(focus.z).toBe(0);
    expect(getDefaultFrontCameraPosition().y).toBe(0);
    expect(getDefaultSideCameraPosition().y).toBe(0);
  });

  it('includes a brush preview child and a result mesh under the root', () => {
    const model = createSolidModelStartupDefault();
    const brush = model.getBrushes()[0]!;
    expect(brush.mesh).toBeTruthy();
    expect(brush.mesh!.parent).toBe(model.root);
    expect(model.getResultMesh().parent).toBe(model.root);
    const positions = model.getResultMesh().geometry.getAttribute('position');
    expect(positions).toBeTruthy();
    expect(positions.count).toBeGreaterThanOrEqual(3);
  });
});
