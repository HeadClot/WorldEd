import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';
import { ApplyFaceTextureCommand } from '../../../src/commands/texture/apply_face_texture_command.js';
import {
  buildTargetsFromFaceSelection,
  initializeMeshTextureUVs,
} from '../../../src/texture/uv/face_texture_applier.js';
import { getFaceTextureMaps } from '../../../src/texture/uv/face_texture_storage.js';
import { computeRegionWorldNormal } from '../../../src/texture/uv/planar_uv_projector.js';
import { readMappingTrs } from '../../../src/texture/uv/uv_trs_ops.js';
import { createContentMaterial } from '../../../src/materials/content_material_factory.js';
import { FaceSelectionManager } from '../../../src/selection/face/face_selection_manager.js';

/**
 * Multi-face UV edits must update every selected surface, not only the last one
 * (solid remesh used to wipe earlier faces mid-sync).
 */
describe('ApplyFaceTextureCommand multi-select', () => {
  it('applies relative scale to every selected solid face in one command', () => {
    const model = new SolidModel('MultiSelectSolidUv');
    model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    const result = model.getResultMesh();
    const maps = getFaceTextureMaps(result);
    const zFaces = maps.filter((entry) => {
      const normal = computeRegionWorldNormal(result, entry.triangleIndices);
      return Math.abs(normal.z) > 0.9;
    });
    expect(zFaces.length).toBeGreaterThanOrEqual(2);
    const faceA = zFaces[0]!;
    const faceB = zFaces[1]!;
    const selection = new FaceSelectionManager();
    selection.selectFace(result, faceA.triangleIndices[0]!, false);
    selection.selectFace(result, faceB.triangleIndices[0]!, true);
    expect(selection.getSelectedFaceCount()).toBe(2);
    const targets = buildTargetsFromFaceSelection(selection.getSelectedFaces());
    expect(targets.length).toBe(2);
    new ApplyFaceTextureCommand(targets, undefined, {
      relativeOp: { kind: 'multiplyScale', axis: 'u', factor: 2 },
    }).execute();
    const after = getFaceTextureMaps(result);
    const afterA = findMatchingRegion(after, faceA.triangleIndices);
    const afterB = findMatchingRegion(after, faceB.triangleIndices);
    expect(afterA).toBeDefined();
    expect(afterB).toBeDefined();
    const trsA = readMappingTrs(afterA!.mapping, computeRegionWorldNormal(result, afterA!.triangleIndices));
    const trsB = readMappingTrs(afterB!.mapping, computeRegionWorldNormal(result, afterB!.triangleIndices));
    expect(trsA.scaleU).toBeCloseTo(2, 4);
    expect(trsB.scaleU).toBeCloseTo(2, 4);
  });

  it('applies partial TRS fields to every selected solid face', () => {
    const model = new SolidModel('MultiSelectPartialSolidUv');
    model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    const result = model.getResultMesh();
    const maps = getFaceTextureMaps(result);
    const walls = maps.filter((entry) => {
      const normal = computeRegionWorldNormal(result, entry.triangleIndices);
      return Math.abs(normal.y) < 0.2;
    });
    expect(walls.length).toBeGreaterThanOrEqual(2);
    const wallA = walls[0]!;
    const wallB = walls[1]!;
    const targets = buildTargetsFromFaceSelection([
      { mesh: result, faceIndex: wallA.triangleIndices[0]! },
      { mesh: result, faceIndex: wallB.triangleIndices[0]! },
    ]);
    expect(targets.length).toBe(2);
    new ApplyFaceTextureCommand(targets, undefined, {
      partialTrs: { rotationDeg: 90 },
    }).execute();
    const after = getFaceTextureMaps(result);
    const afterA = findMatchingRegion(after, wallA.triangleIndices);
    const afterB = findMatchingRegion(after, wallB.triangleIndices);
    expect(afterA).toBeDefined();
    expect(afterB).toBeDefined();
    const trsA = readMappingTrs(afterA!.mapping, computeRegionWorldNormal(result, afterA!.triangleIndices));
    const trsB = readMappingTrs(afterB!.mapping, computeRegionWorldNormal(result, afterB!.triangleIndices));
    expect(trsA.rotationDeg).toBeCloseTo(90, 2);
    expect(trsB.rotationDeg).toBeCloseTo(90, 2);
  });

  it('applies relative rotation to every selected content-mesh face', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0x888888));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const maps = getFaceTextureMaps(mesh);
    expect(maps.length).toBeGreaterThanOrEqual(2);
    const targets = [
      {
        mesh,
        triangleIndices: maps[0]!.triangleIndices.slice(),
        previousMapping: maps[0]!.mapping,
      },
      {
        mesh,
        triangleIndices: maps[1]!.triangleIndices.slice(),
        previousMapping: maps[1]!.mapping,
      },
    ];
    new ApplyFaceTextureCommand(targets, undefined, {
      relativeOp: { kind: 'addRotation', degrees: 90 },
    }).execute();
    const after = getFaceTextureMaps(mesh);
    const after0 = after.find((entry) => entry.triangleIndices[0] === maps[0]!.triangleIndices[0])!;
    const after1 = after.find((entry) => entry.triangleIndices[0] === maps[1]!.triangleIndices[0])!;
    const trs0 = readMappingTrs(after0.mapping, computeRegionWorldNormal(mesh, after0.triangleIndices));
    const trs1 = readMappingTrs(after1.mapping, computeRegionWorldNormal(mesh, after1.triangleIndices));
    expect(trs0.rotationDeg).toBeCloseTo(90, 2);
    expect(trs1.rotationDeg).toBeCloseTo(90, 2);
  });
});

/**
 * Finds a stored region that shares any triangle with the reference region.
 *
 * @param entries Face texture maps after remesh.
 * @param referenceIndices Original triangle indices.
 * @returns Matching entry or undefined.
 */
function findMatchingRegion(
  entries: ReturnType<typeof getFaceTextureMaps>,
  referenceIndices: number[],
): (typeof entries)[number] | undefined {
  const set = new Set(referenceIndices);
  return entries.find((entry) => entry.triangleIndices.some((index) => set.has(index)));
}
