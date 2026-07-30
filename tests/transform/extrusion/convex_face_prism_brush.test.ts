import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createConvexPrismBrushFromFace } from '@/transform/extrusion/convex_face_prism_brush.js';
import { findCoplanarFaceIndices } from '@/selection/pick/utils_triangle_geometry.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';

describe('createConvexPrismBrushFromFace', () => {
  it('should build a valid convex prism brush from a box face', () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    source.updateMatrixWorld(true);
    const faceIndices = findCoplanarFaceIndices(source.geometry, 0);
    const placement = createConvexPrismBrushFromFace(source, faceIndices, 1.0);
    expect(placement).not.toBeNull();
    const validation = SolidBrushValidator.validate(placement!.brush);
    expect(validation.valid).toBe(true);
    expect(placement!.brush.faces.length).toBeGreaterThanOrEqual(5);
    expect(placement!.brush.vertices.length).toBeGreaterThanOrEqual(6);
  });

  it('should center brush topology about the local origin', () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    source.position.set(0, 4, 0);
    source.updateMatrixWorld(true);
    const faceIndices = findCoplanarFaceIndices(source.geometry, 0);
    const placement = createConvexPrismBrushFromFace(source, faceIndices, 0.5);
    expect(placement).not.toBeNull();
    const center = placement!.brush.computeLocalBounds().getCenter(new THREE.Vector3());
    expect(center.length()).toBeLessThan(1e-3);
    expect(placement!.localPosition.length()).toBeGreaterThan(0.1);
  });

  it('should express placement relative to a solid model root space', () => {
    const root = new THREE.Group();
    root.position.set(10, 0, 0);
    root.updateMatrixWorld(true);
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    root.add(source);
    source.position.set(0, 2, 0);
    source.updateMatrixWorld(true);
    const faceIndices = findCoplanarFaceIndices(source.geometry, 0);
    const worldPlacement = createConvexPrismBrushFromFace(source, faceIndices, 1.0);
    const localPlacement = createConvexPrismBrushFromFace(source, faceIndices, 1.0, root);
    expect(worldPlacement).not.toBeNull();
    expect(localPlacement).not.toBeNull();
    // Root sits at world X=10, so model-local placement must not keep that offset.
    expect(localPlacement!.localPosition.x).toBeCloseTo(worldPlacement!.localPosition.x - 10, 2);
    expect(localPlacement!.localPosition.y).toBeCloseTo(worldPlacement!.localPosition.y, 2);
    expect(localPlacement!.localPosition.z).toBeCloseTo(worldPlacement!.localPosition.z, 2);
  });

  it('should return null for empty face selection', () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    expect(createConvexPrismBrushFromFace(source, [], 1.0)).toBeNull();
  });

  it('should return null for zero distance', () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const faceIndices = findCoplanarFaceIndices(source.geometry, 0);
    expect(createConvexPrismBrushFromFace(source, faceIndices, 0)).toBeNull();
  });
});
