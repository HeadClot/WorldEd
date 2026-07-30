import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import {
  convertBrushLocalFaceMappingToWorld,
  convertWorldFaceMappingForCenteredBrush,
  convertWorldFaceMappingToBrushLocal,
} from '@/solid/brush/solid_brush_uv_space.js';
import { createFaceTextureMappingFromTrs } from '@/texture/uv/face_texture_mapping.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** World ↔ brush-local UV matrix conversion for solid storage and result maps. */
describe('solid brush UV space conversion', () => {
  it('round-trips world and brush-local UV matrices through brush pose', () => {
    const model = new SolidModel('UvSpaceRoundTrip');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    brush.mesh!.position.set(4, -2, 1.5);
    brush.mesh!.updateMatrixWorld(true);
    brush.pullTransformFromMesh();
    const worldMapping = createFaceTextureMappingFromTrs(
      'tex.png',
      new THREE.Vector3(0, 1, 0),
      { scaleU: 2, scaleV: 3, offsetU: 0.25, offsetV: -0.5, rotationDeg: 15 },
      'face',
    );
    const localMapping = convertWorldFaceMappingToBrushLocal(worldMapping, brush, model.root);
    const backToWorld = convertBrushLocalFaceMappingToWorld(localMapping, brush, model.root);
    expect(backToWorld.uv.u.x).toBeCloseTo(worldMapping.uv.u.x, 5);
    expect(backToWorld.uv.u.y).toBeCloseTo(worldMapping.uv.u.y, 5);
    expect(backToWorld.uv.u.z).toBeCloseTo(worldMapping.uv.u.z, 5);
    expect(backToWorld.uv.u.w).toBeCloseTo(worldMapping.uv.u.w, 5);
    expect(backToWorld.uv.v.x).toBeCloseTo(worldMapping.uv.v.x, 5);
    expect(backToWorld.uv.v.y).toBeCloseTo(worldMapping.uv.v.y, 5);
    expect(backToWorld.uv.v.z).toBeCloseTo(worldMapping.uv.v.z, 5);
    expect(backToWorld.uv.v.w).toBeCloseTo(worldMapping.uv.v.w, 5);
  });

  it('centered-brush conversion matches world projection after translation', () => {
    const worldCenter = new THREE.Vector3(10, 0, -4);
    const worldMapping = {
      textureId: 'vmf.png',
      uv: new SurfaceUvMatrix(new THREE.Vector4(1, 0, 0, 0), new THREE.Vector4(0, 0, 1, 0)),
      align: 'face' as const,
    };
    const localMapping = convertWorldFaceMappingForCenteredBrush(worldMapping, worldCenter);
    const worldPoint = new THREE.Vector3(12, 3, -2);
    const localPoint = worldPoint.clone().sub(worldCenter);
    const worldUv = worldMapping.uv.project(worldPoint);
    const localUv = localMapping.uv.project(localPoint);
    expect(localUv.u).toBeCloseTo(worldUv.u, 6);
    expect(localUv.v).toBeCloseTo(worldUv.v, 6);
  });
});
