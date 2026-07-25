import { describe, it, expect } from 'vitest';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { createDefaultFaceTextureMapping } from '../../src/texture/uv/face_texture_mapping.js';
import { setFaceTextureMaps } from '../../src/texture/uv/face_texture_storage.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '../../src/solid/model/solid_model.js';

/**
 * Regression: UV smear used to drop mesh chunks for every mapped brush; the
 * next CSG full assemble then only rebuilt dirty chunks and deleted most of the
 * world.
 */
describe('Solid mesh chunk ensure after mapping sync', () => {
  it('keeps all brushes in the result after smear sync then moving one brush', () => {
    const model = new SolidModel('ChunkEnsure');
    const spacing = 3;
    const brushes = [];
    for (let index = 0; index < 12; index++) {
      const brush = model.addBoxBrush(1.5, SolidOperation.Additive);
      brush.position.set((index % 4) * spacing, 0, Math.floor(index / 4) * spacing);
      brush.pushTransformToMesh();
      brushes.push(brush);
    }
    model.markDirty();
    model.rebuild(true);
    const result = model.getResultMesh();
    const beforeCount = result.geometry.getAttribute('position').count;
    expect(beforeCount).toBeGreaterThan(100);

    const mapping = createDefaultFaceTextureMapping('floor.png');
    mapping.scaleU = 4;
    mapping.scaleV = 4;
    const sources = result.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as
      Array<{ brushId: string; surfaceIndex: number }> | undefined;
    expect(sources?.length).toBeGreaterThan(0);
    const allTriangles = sources!.map((_, index) => index);
    setFaceTextureMaps(result, [{ triangleIndices: allTriangles, mapping }]);
    model.syncAuthoredMappingsFromResultMesh();

    const mover = brushes[0]!;
    mover.position.x += 0.75;
    mover.pushTransformToMesh();
    model.syncBrushesFromScene();
    model.rebuild(true);

    const afterCount = model.getResultMesh().geometry.getAttribute('position').count;
    expect(afterCount).toBeGreaterThan(beforeCount * 0.5);
    expect(model.getBrushCount()).toBe(12);
    for (const brush of model.getBrushes()) {
      const faceMap = brush.getSurfaceMapping(0);
      expect(faceMap.scaleU!).toBeCloseTo(4, 5);
    }
  });

  it('restores missing chunks when a full assemble is required after topology change', () => {
    const model = new SolidModel('TopologyEnsure');
    const base = model.addBoxBrush(4, SolidOperation.Additive);
    const cutter = model.addBoxBrush(1.5, SolidOperation.Subtractive);
    cutter.position.set(10, 0, 0);
    cutter.pushTransformToMesh();
    model.syncBrushesFromScene();
    model.rebuild(true);
    const before = model.getResultMesh().geometry.getAttribute('position').count;

    const mapping = createDefaultFaceTextureMapping('wall.png');
    mapping.scaleU = 2;
    mapping.scaleV = 2;
    const result = model.getResultMesh();
    const triCount = (result.geometry.getAttribute('position').count as number) / 3;
    setFaceTextureMaps(result, [
      {
        triangleIndices: Array.from({ length: triCount }, (_, i) => i),
        mapping,
      },
    ]);
    model.syncAuthoredMappingsFromResultMesh();

    cutter.position.set(0, 0, 0);
    cutter.pushTransformToMesh();
    model.syncBrushesFromScene();
    model.rebuild(true);
    const after = model.getResultMesh().geometry.getAttribute('position').count;
    expect(after).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(before * 0.25);
    expect(base.getSurfaceMapping(0).scaleU!).toBeCloseTo(2, 5);
  });
});
