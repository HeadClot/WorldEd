import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { CommandTextureSolidBrushAssign } from '@/texture/commands/command_texture_solid_brush_assign.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** Per-brush surface textures bake into the CSG result, never helper previews. */
describe('Solid brush surface textures', () => {
  it('stores texture on the brush and bakes it into the result mesh only', () => {
    const model = new SolidModel('TexSolid');
    const additive = model.addBoxBrush(2, SolidOperation.Additive);
    const subtractive = model.addBoxBrush(1, SolidOperation.Subtractive);
    expect(additive.mesh && subtractive.mesh).toBeTruthy();
    const textureId = 'folder/test_wall.png';
    const command = new CommandTextureSolidBrushAssign([additive.mesh!], textureId);
    command.execute();
    expect(additive.surfaceTextureId).toBe(textureId);
    expect(subtractive.surfaceTextureId).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    const maps = getFaceTextureMaps(model.getResultMesh());
    expect(maps.length).toBeGreaterThan(0);
    expect(maps.some((entry) => entry.mapping.textureId === textureId)).toBe(true);
    const brushMaterial = additive.mesh!.material as THREE.MeshBasicMaterial;
    expect(brushMaterial).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(brushMaterial.map).toBeNull();
    expect(brushMaterial.colorWrite).toBe(false);
    expect(brushMaterial.visible).toBe(false);
    expect(brushMaterial.depthWrite).toBe(false);
    expect(brushMaterial.transparent).toBe(false);
    expect(brushMaterial.side).toBe(THREE.FrontSide);
    expect(SolidBrushVisual.isBrushObject(additive.mesh!)).toBe(true);
    expect(SolidBrushVisual.isHullFillVisible(additive.mesh!)).toBe(false);
  });

  it('undo restores prior brush texture ids', () => {
    const model = new SolidModel('UndoTex');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const command = new CommandTextureSolidBrushAssign([brush.mesh!], 'folder/custom.png');
    command.execute();
    expect(brush.surfaceTextureId).toBe('folder/custom.png');
    command.undo();
    expect(brush.surfaceTextureId).toBe(DEFAULT_CHECKER_TEXTURE_ID);
  });

  it('whole-brush paint updates every face texture id and undoes to prior ids', () => {
    const model = new SolidModel('UndoFaceTex');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    brush.setFaceTextureId(0, 'folder/face0.png');
    brush.setFaceTextureId(2, 'folder/face2.png');
    const command = new CommandTextureSolidBrushAssign([brush.mesh!], 'folder/whole.png');
    command.execute();
    expect(brush.surfaceTextureId).toBe('folder/whole.png');
    expect(brush.getSurfaceTextureId(0)).toBe('folder/whole.png');
    expect(brush.getSurfaceTextureId(2)).toBe('folder/whole.png');
    command.undo();
    expect(brush.surfaceTextureId).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    expect(brush.getSurfaceTextureId(0)).toBe('folder/face0.png');
    expect(brush.getSurfaceTextureId(2)).toBe('folder/face2.png');
  });

  it('whole-brush texture assign preserves authored face UV matrices', () => {
    const model = new SolidModel('PreserveUvOnAssign');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const faceIndex = 0;
    const mapping = brush.getSurfaceMapping(faceIndex);
    mapping.scaleU = 2.5;
    mapping.scaleV = 0.75;
    mapping.offsetU = 0.3;
    mapping.offsetV = -0.2;
    mapping.rotationDeg = 35;
    brush.setFaceMapping(faceIndex, mapping);
    const uvBefore = captureSurfaceUv(brush.getSurfaceMapping(faceIndex).uv);
    const command = new CommandTextureSolidBrushAssign([brush.mesh!], 'folder/new_wall.png');
    command.execute();
    expect(brush.getSurfaceTextureId(faceIndex)).toBe('folder/new_wall.png');
    expect(brush.surfaceTextureId).toBe('folder/new_wall.png');
    const uvAfter = captureSurfaceUv(brush.getSurfaceMapping(faceIndex).uv);
    expect(uvAfter).toEqual(uvBefore);
  });

  it('whole-brush texture assign preserves default surface UV matrix', () => {
    const model = new SolidModel('PreserveDefaultUvOnAssign');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const customDefault = brush.serializeDefaultMapping();
    customDefault.uv = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0.25, -0.1), new THREE.Vector3(0, 1, 0), 15, 0.5, 2);
    brush.restoreFaceMappings(customDefault, brush.serializeFaceMappings());
    const uvBefore = captureSurfaceUv(brush.serializeDefaultMapping().uv);
    const command = new CommandTextureSolidBrushAssign([brush.mesh!], 'folder/floor.png');
    command.execute();
    expect(brush.surfaceTextureId).toBe('folder/floor.png');
    const uvAfter = captureSurfaceUv(brush.serializeDefaultMapping().uv);
    expect(uvAfter).toEqual(uvBefore);
  });
});

/**
 * Flattens a surface UV matrix to comparable numbers.
 *
 * @param uv Surface UV matrix.
 * @returns Twelve component values.
 */
function captureSurfaceUv(uv: SurfaceUvMatrix): number[] {
  return [uv.u.x, uv.u.y, uv.u.z, uv.u.w, uv.v.x, uv.v.y, uv.v.z, uv.v.w];
}
