import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { applyObjectTransformToSolidBrush } from '@/transform/apply/object_apply_transform_brush.js';
import { objectApplyTransformFlagsFromKind } from '@/transform/apply/object_apply_transform_flags.js';
import { ObjectApplyTransformKind } from '@/types/object_apply_transform_kind.js';
import { SolidModel } from '@/solid/model/solid_model.js';

/**
 * Builds a solid model with one translated brush instance.
 *
 * @returns Solid model and brush instance.
 */
function createTranslatedBrushModel(): { solidModel: SolidModel; instance: SolidBrushInstance } {
  const solidModel = new SolidModel();
  const brush = SolidBrushFactory.createBox(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  const instance = new SolidBrushInstance('brush-1', 'Brush', brush, SolidOperation.Additive);
  instance.position.set(3, 0, 0);
  instance.scale.set(2, 1, 1);
  solidModel.addBrushInstance(instance);
  return { solidModel, instance };
}

/**
 * Builds model-space world positions for every brush vertex under the instance
 * pose.
 *
 * @param instance Brush instance.
 * @returns World positions in model space.
 */
function collectBrushWorldVertices(instance: SolidBrushInstance): THREE.Vector3[] {
  const matrix = composeInstanceMatrix(instance);
  return instance.brush.vertices.map((vertex) => vertex.clone().applyMatrix4(matrix));
}

/**
 * Composes the brush instance local matrix.
 *
 * @param instance Brush instance.
 * @returns Local TRS matrix.
 */
function composeInstanceMatrix(instance: SolidBrushInstance): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    instance.position,
    new THREE.Quaternion().setFromEuler(instance.rotation),
    instance.scale,
  );
}

/**
 * Asserts two world-space point lists match within a tight epsilon.
 *
 * @param before Points before apply.
 * @param after Points after apply.
 */
function expectWorldVerticesMatch(before: readonly THREE.Vector3[], after: readonly THREE.Vector3[]): void {
  expect(after).toHaveLength(before.length);
  for (let index = 0; index < before.length; index++) {
    expect(after[index]!.distanceTo(before[index]!)).toBeLessThan(1e-5);
  }
}

describe('applyObjectTransformToSolidBrush', () => {
  it('bakes scale and location into vertices and resets pose', () => {
    const { solidModel, instance } = createTranslatedBrushModel();
    const before = instance.brush.vertices[0]!.clone();
    const flags = objectApplyTransformFlagsFromKind(ObjectApplyTransformKind.ALL_TRANSFORMS);
    const snapshot = applyObjectTransformToSolidBrush(solidModel, instance, flags);
    expect(snapshot).not.toBeNull();
    expect(instance.position.lengthSq()).toBeCloseTo(0, 5);
    expect(instance.scale.x).toBeCloseTo(1, 5);
    expect(instance.brush.vertices[0]!.distanceTo(before)).toBeGreaterThan(0.5);
  });

  it('keeps brush-local UV projections for vertices after scale bake', () => {
    const { solidModel, instance } = createTranslatedBrushModel();
    instance.position.set(0, 0, 0);
    instance.scale.set(2, 2, 2);
    const corner = instance.brush.vertices[0]!.clone();
    const surface = instance.getFaceSurface(0);
    const uvBefore = surface.uv.project(corner);
    const flags = objectApplyTransformFlagsFromKind(ObjectApplyTransformKind.SCALE);
    applyObjectTransformToSolidBrush(solidModel, instance, flags);
    const uvAfter = instance.getFaceSurface(0).uv.project(instance.brush.vertices[0]!);
    expect(uvAfter.u).toBeCloseTo(uvBefore.u, 4);
    expect(uvAfter.v).toBeCloseTo(uvBefore.v, 4);
  });

  it('keeps UV projections for vertices after location bake', () => {
    const { solidModel, instance } = createTranslatedBrushModel();
    instance.scale.set(1, 1, 1);
    instance.position.set(3, 0, 0);
    const corner = instance.brush.vertices[0]!.clone();
    const surface = instance.getFaceSurface(0);
    const uvBefore = surface.uv.project(corner);
    const flags = objectApplyTransformFlagsFromKind(ObjectApplyTransformKind.LOCATION);
    applyObjectTransformToSolidBrush(solidModel, instance, flags);
    const uvAfter = instance.getFaceSurface(0).uv.project(instance.brush.vertices[0]!);
    expect(uvAfter.u).toBeCloseTo(uvBefore.u, 4);
    expect(uvAfter.v).toBeCloseTo(uvBefore.v, 4);
  });

  it('apply location on a scaled brush does not move world geometry', () => {
    const { solidModel, instance } = createTranslatedBrushModel();
    writeBrushPose(instance, new THREE.Vector3(3, 1, -2), new THREE.Euler(0, 0, 0), new THREE.Vector3(2, 0.5, 1.5));
    const beforeWorld = collectBrushWorldVertices(instance);
    applyObjectTransformToSolidBrush(
      solidModel,
      instance,
      objectApplyTransformFlagsFromKind(ObjectApplyTransformKind.LOCATION),
    );
    expect(instance.position.lengthSq()).toBeCloseTo(0, 5);
    expect(instance.scale.x).toBeCloseTo(2, 5);
    expectWorldVerticesMatch(beforeWorld, collectBrushWorldVertices(instance));
  });

  it('apply rotation with non-uniform scale does not shear world geometry', () => {
    const { solidModel, instance } = createTranslatedBrushModel();
    writeBrushPose(
      instance,
      new THREE.Vector3(1, 2, 3),
      new THREE.Euler(0.4, 0.7, -0.2),
      new THREE.Vector3(2, 0.5, 1.25),
    );
    const beforeWorld = collectBrushWorldVertices(instance);
    applyObjectTransformToSolidBrush(
      solidModel,
      instance,
      objectApplyTransformFlagsFromKind(ObjectApplyTransformKind.ROTATION),
    );
    expect(instance.rotation.x).toBeCloseTo(0, 5);
    expect(instance.rotation.y).toBeCloseTo(0, 5);
    expect(instance.rotation.z).toBeCloseTo(0, 5);
    expect(instance.position.x).toBeCloseTo(1, 5);
    expect(instance.scale.x).toBeCloseTo(2, 5);
    expect(instance.scale.y).toBeCloseTo(0.5, 5);
    expectWorldVerticesMatch(beforeWorld, collectBrushWorldVertices(instance));
  });

  it('apply scale with rotation and location preserves world geometry', () => {
    const { solidModel, instance } = createTranslatedBrushModel();
    writeBrushPose(
      instance,
      new THREE.Vector3(-2, 0.5, 1),
      new THREE.Euler(0.2, -0.5, 0.3),
      new THREE.Vector3(1.5, 2, 0.75),
    );
    const beforeWorld = collectBrushWorldVertices(instance);
    applyObjectTransformToSolidBrush(
      solidModel,
      instance,
      objectApplyTransformFlagsFromKind(ObjectApplyTransformKind.SCALE),
    );
    expect(instance.scale.x).toBeCloseTo(1, 5);
    expect(instance.scale.y).toBeCloseTo(1, 5);
    expect(instance.scale.z).toBeCloseTo(1, 5);
    expect(instance.position.x).toBeCloseTo(-2, 5);
    expect(Math.abs(instance.rotation.y)).toBeGreaterThan(0.1);
    expectWorldVerticesMatch(beforeWorld, collectBrushWorldVertices(instance));
  });
});

/**
 * Writes pose onto the brush instance and its preview mesh.
 *
 * @param instance Brush instance.
 * @param position Local position.
 * @param rotation Local rotation.
 * @param scale Local scale.
 */
function writeBrushPose(
  instance: SolidBrushInstance,
  position: THREE.Vector3,
  rotation: THREE.Euler,
  scale: THREE.Vector3,
): void {
  instance.position.copy(position);
  instance.rotation.copy(rotation);
  instance.scale.copy(scale);
  instance.pushTransformToMesh();
}
