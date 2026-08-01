import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { CommandTextureFaceApply } from '@/texture/commands/command_texture_face_apply.js';
import { ControllerUvEditor } from '@/texture/controller/controller_uv_editor.js';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { SelectionMode } from '@/types/selection_mode.js';
import { buildTargetsFromMeshes } from '@/texture/uv/face_texture_applier.js';
import { buildTargetsFromSolidBrushMesh } from '@/texture/uv/solid_brush_texture_targets.js';
import {
  createDefaultFaceTextureMapping,
  FaceTextureMapping,
  FaceTextureMappingTrs,
  getFaceTextureMappingTrs,
} from '@/texture/uv/face_texture_mapping.js';
import { setStateTexturePaintForTests, StateTexturePaint } from '@/texture/paint/state_texture_paint.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';

/** Runtime TRS proxy fields used by texture mapping tests. */
type MappingWithTrs = FaceTextureMapping & FaceTextureMappingTrs;

/**
 * Object-mode UV editor must edit solid brush authorship via the CSG result,
 * never rewrite brush hull materials (which would hide the volume).
 */
describe('UV editor solid brush object mode', () => {
  beforeEach(() => {
    setStateTexturePaintForTests(new StateTexturePaint());
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setStateTexturePaintForTests(null);
    setTextureMapCacheForTests(null);
  });

  it('maps selected brush meshes to result-mesh face targets', () => {
    const model = new SolidModel('BrushObjectTargets');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    const brushMesh = brush.mesh!;
    const result = model.getResultMesh();
    const targets = buildTargetsFromSolidBrushMesh(brushMesh);
    expect(targets.length).toBeGreaterThan(0);
    targets.forEach((target) => {
      expect(target.mesh).toBe(result);
      expect(SolidBrushVisual.isBrushObject(target.mesh)).toBe(false);
      expect(target.triangleIndices.length).toBeGreaterThan(0);
    });
    const viaMeshes = buildTargetsFromMeshes([brushMesh]);
    expect(viaMeshes.length).toBe(targets.length);
    viaMeshes.forEach((target) => {
      expect(target.mesh).toBe(result);
    });
  });

  it('applies relative UV scale to brush authorship without destroying the hull', () => {
    const model = new SolidModel('BrushObjectScale');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mapping = createDefaultFaceTextureMapping('brush-uv.png') as MappingWithTrs;
    mapping.scaleU = 1;
    mapping.scaleV = 1;
    brush.setFaceMapping(0, mapping);
    model.rebuild(true);
    const brushMesh = brush.mesh!;
    const hullMaterialBefore = brushMesh.material;
    const beforeTrs = getFaceTextureMappingTrs(brush.getSurfaceMapping(0), brush.faceNormalLocal(0));
    const targets = buildTargetsFromMeshes([brushMesh]);
    expect(targets.length).toBeGreaterThan(0);
    new CommandTextureFaceApply(targets, createDefaultFaceTextureMapping(), {
      relativeOp: { kind: 'multiplyScale', axis: 'u', factor: 2 },
    }).execute();
    const afterTrs = getFaceTextureMappingTrs(brush.getSurfaceMapping(0), brush.faceNormalLocal(0));
    expect(afterTrs.scaleU).toBeCloseTo(beforeTrs.scaleU * 2, 4);
    expect(SolidBrushVisual.isBrushObject(brushMesh)).toBe(true);
    expect(brushMesh.material).toBe(hullMaterialBefore);
    expect(brushMesh.visible).toBe(true);
  });

  it('applies UV editor relative ops through the controller with a brush selected', () => {
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    const model = new SolidModel('BrushControllerUv');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mapping = createDefaultFaceTextureMapping('ctrl.png') as MappingWithTrs;
    mapping.offsetU = 0;
    brush.setFaceMapping(0, mapping);
    model.rebuild(true);
    world.add(model.root);
    const brushMesh = brush.mesh!;
    const selection = new ManagerSelection();
    selection.setSelection([brushMesh], [brushMesh]);
    const stack = new CommandStack(16);
    const faceController = new ControllerFaceExtrusion(scene, stack, new GridSnap(false, 1), world);
    faceController.setSelectionMode(SelectionMode.OBJECT);
    const controller = new ControllerUvEditor(selection, faceController, stack);
    const hullMaterialBefore = brushMesh.material;
    const beforeOffset = getFaceTextureMappingTrs(brush.getSurfaceMapping(0), brush.faceNormalLocal(0)).offsetU;
    controller.applyRelativeOp({ kind: 'addOffset', axis: 'u', delta: 0.25 });
    const afterOffset = getFaceTextureMappingTrs(brush.getSurfaceMapping(0), brush.faceNormalLocal(0)).offsetU;
    expect(afterOffset).toBeCloseTo(beforeOffset + 0.25, 4);
    expect(brushMesh.material).toBe(hullMaterialBefore);
    expect(SolidBrushVisual.isBrushObject(brushMesh)).toBe(true);
  });
});
