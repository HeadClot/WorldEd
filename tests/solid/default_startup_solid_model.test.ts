import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createDefaultStartupSolidModel,
  DEFAULT_STARTUP_BRUSH_SIZE,
} from '../../src/solid/model/default_startup_solid_model.js';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { DEFAULT_CUBE_CENTER_Y } from '../../src/types/editor_config.js';
import {
  getDefaultFrontCameraPosition,
  getDefaultSceneFocus,
  getDefaultSideCameraPosition,
} from '../../src/navigation/default_camera_placement.js';

/** Startup solid model must match the old unit-cube footprint and framing. */
describe('createDefaultStartupSolidModel', () => {
  it('creates a solid model with one additive unit brush lifted onto the ground', () => {
    const model = createDefaultStartupSolidModel();
    expect(SolidModel.isSolidModelObject(model.root)).toBe(true);
    expect(model.root.name).toBe('DefaultModel');
    expect(model.getBrushCount()).toBe(1);
    expect(DEFAULT_STARTUP_BRUSH_SIZE).toBe(1);
    const brush = model.getBrushes()[0];
    expect(brush.operation).toBe(SolidOperation.Additive);
    // Brush stays local-centered; the model root is lifted so world Y is 0…1.
    expect(brush.position.y).toBeCloseTo(0, 5);
    expect(model.root.position.y).toBeCloseTo(DEFAULT_CUBE_CENTER_Y, 5);
  });

  it('builds result geometry that sits on the ground plane with unit bounds', () => {
    const model = createDefaultStartupSolidModel();
    const result = model.getResultMesh();
    expect(result.parent).toBe(model.root);
    result.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(result);
    expect(box.min.y).toBeCloseTo(0, 4);
    expect(box.max.y).toBeCloseTo(1, 4);
    expect(box.max.x - box.min.x).toBeCloseTo(1, 4);
    expect(box.max.z - box.min.z).toBeCloseTo(1, 4);
    const center = box.getCenter(new THREE.Vector3());
    expect(center.y).toBeCloseTo(DEFAULT_CUBE_CENTER_Y, 4);
    expect(center.x).toBeCloseTo(0, 4);
    expect(center.z).toBeCloseTo(0, 4);
  });

  it('keeps the result center aligned with default camera focus', () => {
    const model = createDefaultStartupSolidModel();
    const result = model.getResultMesh();
    result.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(result).getCenter(new THREE.Vector3());
    const focus = getDefaultSceneFocus();
    expect(center.x).toBeCloseTo(focus.x, 4);
    expect(center.y).toBeCloseTo(focus.y, 4);
    expect(center.z).toBeCloseTo(focus.z, 4);
    expect(getDefaultFrontCameraPosition().y).toBeCloseTo(center.y, 5);
    expect(getDefaultSideCameraPosition().y).toBeCloseTo(center.y, 5);
  });

  it('includes a brush preview child and a result mesh under the root', () => {
    const model = createDefaultStartupSolidModel();
    const brush = model.getBrushes()[0];
    expect(brush.mesh).toBeTruthy();
    expect(brush.mesh!.parent).toBe(model.root);
    expect(model.getResultMesh().parent).toBe(model.root);
    const positions = model.getResultMesh().geometry.getAttribute('position');
    expect(positions).toBeTruthy();
    expect(positions.count).toBeGreaterThanOrEqual(3);
  });
});
