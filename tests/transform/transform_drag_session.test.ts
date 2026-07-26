import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TransformDragSession } from '../../src/transform/transform_drag_session.js';
import { initializeMeshTextureUVs } from '../../src/texture/uv/face_texture_applier.js';
import { contentMeshMappingsMatchCurrentUvs } from '../../src/texture/lock/content_mesh_texture_lock.js';
import { TextureLockSettings } from '../../src/texture/lock/texture_lock_settings.js';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';

describe('TransformDragSession', () => {
  /**
   * Creates a mesh with a non-default transform for snapshot tests.
   *
   * @returns A mesh with position, rotation, and scale set.
   */
  function createTransformedMesh(): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.position.set(1, 2, 3);
    mesh.quaternion.setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
    mesh.scale.set(2, 3, 4);
    return mesh;
  }

  it('should start idle with empty snapshots', () => {
    const session = new TransformDragSession();
    expect(session.dragActive).toBe(false);
    expect(session.initialPositions.size).toBe(0);
    expect(session.dragScaleFactor).toBe(1);
  });

  it('should snapshot pre-drag transforms for selected meshes', () => {
    const session = new TransformDragSession();
    const mesh = createTransformedMesh();
    session.snapshotPreDragState([mesh]);
    const position = session.initialPositions.get(mesh);
    const scale = session.initialScales.get(mesh);
    expect(position?.equals(mesh.position)).toBe(true);
    expect(scale?.equals(mesh.scale)).toBe(true);
    mesh.position.set(9, 9, 9);
    expect(position?.equals(new THREE.Vector3(1, 2, 3))).toBe(true);
  });

  it('should heal stale content UV matrices at pointer-down before scale rebake', () => {
    const session = new TransformDragSession();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    mesh.rotation.x = -Math.PI / 2;
    mesh.updateMatrixWorld(true);
    expect(contentMeshMappingsMatchCurrentUvs(mesh)).toBe(false);
    session.snapshotPreDragState([mesh]);
    expect(contentMeshMappingsMatchCurrentUvs(mesh)).toBe(true);
    const settings = new TextureLockSettings(true, false);
    mesh.scale.set(2, 1, 1);
    mesh.updateMatrixWorld(true);
    settings.applyContentTransformPolicy([mesh], false, true);
    const spans = measureUvSpans(mesh);
    expect(spans.uSpan).toBeGreaterThan(1);
    expect(spans.vSpan).toBeGreaterThan(1);
  });

  it('should not rewrite solid brush UV state at pointer-down', () => {
    const session = new TransformDragSession();
    const model = new SolidModel('DragSessionSolid');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    const brushMesh = brush.mesh!;
    const surfaceBefore = brush.getFaceSurface(0);
    session.snapshotPreDragState([brushMesh]);
    const surfaceAfter = brush.getFaceSurface(0);
    expect(surfaceAfter.uv.equals(surfaceBefore.uv)).toBe(true);
  });

  it('should reset drag accumulators without clearing snapshots', () => {
    const session = new TransformDragSession();
    const mesh = createTransformedMesh();
    session.snapshotPreDragState([mesh]);
    session.dragDeltaAccumulator.set(5, 5, 5);
    session.dragRotationAngle = 1.5;
    session.dragScaleFactor = 2;
    session.resetDragAccumulator();
    expect(session.dragDeltaAccumulator.length()).toBe(0);
    expect(session.dragRotationAngle).toBe(0);
    expect(session.dragScaleFactor).toBe(1);
    expect(session.initialPositions.has(mesh)).toBe(true);
  });

  it('should clear interaction targets after pointer up', () => {
    const session = new TransformDragSession();
    session.dragActive = true;
    session.isBoundsResize = true;
    session.boundsDeltaAlongNormal = 3;
    session.clearInteractionTargets();
    expect(session.dragActive).toBe(false);
    expect(session.isBoundsResize).toBe(false);
    expect(session.boundsDeltaAlongNormal).toBe(0);
    expect(session.activeHandle).toBeNull();
  });
});

/**
 * Returns U and V spans for a mesh UV attribute.
 *
 * @param mesh Mesh with UVs.
 * @returns Positive spans.
 */
function measureUvSpans(mesh: THREE.Mesh): { uSpan: number; vSpan: number } {
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let index = 0; index < uv.count; index++) {
    minU = Math.min(minU, uv.getX(index));
    maxU = Math.max(maxU, uv.getX(index));
    minV = Math.min(minV, uv.getY(index));
    maxV = Math.max(maxV, uv.getY(index));
  }
  return { uSpan: maxU - minU, vSpan: maxV - minV };
}
