import { describe, it, expect } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ControllerUvSmear } from '@/texture/controller/controller_uv_smear.js';
import { CommandStack } from '@/commands/command_stack.js';
import { setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { createDefaultFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model.js';

/** Unit tests for UV smear preserving solid-brush authored scale/phase. */
describe('UV smear solid mapping', () => {
  it('does not replace VMF-scale brush mapping with default 1m scale on G press', () => {
    const model = new SolidModel('SmearSolid');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const authored = createDefaultFaceTextureMapping('maps/test.vtf');
    authored.align = 'face';
    authored.scaleU = 4;
    authored.scaleV = 4;
    authored.offsetU = 0.5;
    authored.offsetV = -0.25;
    brush.setFaceMapping(0, authored);
    model.markDirty();
    model.rebuild(true);
    const result = model.getResultMesh();
    const sources = result.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as
      Array<{ brushId: string; surfaceIndex: number }> | undefined;
    expect(sources?.length).toBeGreaterThan(0);
    const seedTriangle = sources!.findIndex((source) => source.brushId === brush.id && source.surfaceIndex === 0);
    expect(seedTriangle).toBeGreaterThanOrEqual(0);

    const controller = new ControllerUvSmear(new CommandStack(8));
    controller.beginStroke(result, seedTriangle);
    controller.endStroke();

    const after = brush.getSurfaceMapping(0);
    expect(after.scaleU).toBeCloseTo(4, 5);
    expect(after.scaleV).toBeCloseTo(4, 5);
    expect(after.offsetU).toBeCloseTo(0.5, 5);
    expect(after.offsetV).toBeCloseTo(-0.25, 5);
    expect(after.textureId).toBe('maps/test.vtf');
  });

  it('keeps authored scale after CSG rebuild following a smear seed', () => {
    const model = new SolidModel('SmearRebuild');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const authored = createDefaultFaceTextureMapping('wall.png');
    authored.scaleU = 3.5;
    authored.scaleV = 3.5;
    brush.setAllFacesTextureId('wall.png');
    for (let i = 0; i < brush.brush.faces.length; i++) {
      const mapping = brush.getSurfaceMapping(i);
      mapping.scaleU = 3.5;
      mapping.scaleV = 3.5;
      brush.setFaceMapping(i, mapping);
    }
    model.rebuild(true);
    const result = model.getResultMesh();
    const sources = result.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as
      Array<{ brushId: string; surfaceIndex: number }> | undefined;
    const seedTriangle = sources!.findIndex((s) => s.brushId === brush.id);
    const controller = new ControllerUvSmear(new CommandStack(8));
    controller.beginStroke(result, seedTriangle);
    controller.endStroke();
    brush.position.x += 0.4;
    brush.pushTransformToMesh();
    model.syncBrushesFromScene();
    model.rebuild(true);
    const after = brush.getSurfaceMapping(0);
    expect(after.scaleU).toBeCloseTo(3.5, 3);
    expect(after.scaleV).toBeCloseTo(3.5, 3);
  });

  it('prefers a covering face-map entry when region triangle sets differ', () => {
    const model = new SolidModel('CoverMap');
    model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    const result = model.getResultMesh();
    const authored = createDefaultFaceTextureMapping('cover.png');
    authored.scaleU = 2.25;
    authored.scaleV = 2.25;
    setFaceTextureMaps(result, [
      {
        triangleIndices: [0, 1],
        mapping: authored,
      },
    ]);
    const controller = new ControllerUvSmear(new CommandStack(8));
    controller.beginStroke(result, 0);
    controller.endStroke();
    const maps = result.userData['faceTextureMaps'] as Array<{ mapping: { scaleU: number } }> | undefined;
    expect(maps?.some((entry) => Math.abs((entry.mapping.scaleU ?? 0) - 2.25) < 0.05)).toBe(true);
  });
});
