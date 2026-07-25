import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VmfUvConverter, VMF_DEFAULT_TEXTURE_SIZE } from '../../../src/io/vmf/vmf_uv_converter.js';
import { VMF_INCHES_TO_METERS } from '../../../src/io/vmf/vmf_coordinates.js';
import { projectWorldPositionToUv, resolveProjectionBasis } from '../../../src/texture/uv/planar_uv_projector.js';
import { VmfParser } from '../../../src/io/vmf/vmf_parser.js';
import { VmfBrushFromSides } from '../../../src/io/vmf/vmf_brush_from_sides.js';
import { buildAxisAlignedWorldSolidVmf } from './vmf_test_solids.js';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';

/** VMF UV conversion must match Source axis phase for world-projected faces. */
describe('VmfUvConverter', () => {
  it('stores custom world axes and Source-scale meters per tile', () => {
    const converter = new VmfUvConverter();
    const mapping = converter.convertSideMapping(
      'DEV/DEV_MEASUREGENERIC01',
      { x: 1, y: 0, z: 0, translation: 0, scale: 0.25 },
      { x: 0, y: -1, z: 0, translation: 0, scale: 0.25 },
      new THREE.Vector3(0, 1, 0),
    );
    const uLen = Math.hypot(mapping.uv.u.x, mapping.uv.u.y, mapping.uv.u.z);
    const vLen = Math.hypot(mapping.uv.v.x, mapping.uv.v.y, mapping.uv.v.z);
    expect(mapping.uv.u.x / uLen).toBeCloseTo(1, 5);
    // Source (1,0,0)/(0,-1,0) → Three (1,0,0)/(0,0,-1), then V flipped → (0,0,1)
    expect(mapping.uv.v.z / vLen).toBeCloseTo(1, 5);
    const expectedScale = VMF_DEFAULT_TEXTURE_SIZE * 0.25 * VMF_INCHES_TO_METERS;
    expect(1 / uLen).toBeCloseTo(expectedScale, 5);
    expect(1 / vLen).toBeCloseTo(expectedScale, 5);
  });

  it('matches Hammer UV phase for a point on an axis-aligned face', () => {
    const converter = new VmfUvConverter();
    const uAxis = { x: 1, y: 0, z: 0, translation: 16, scale: 0.25 };
    const vAxis = { x: 0, y: -1, z: 0, translation: -8, scale: 0.25 };
    const mapping = converter.convertSideMapping('DEV/DEV', uAxis, vAxis, new THREE.Vector3(0, 0, 1));
    // Source inches (x,y,z) → editor meters (x,z,y)*unitScale.
    const sourcePos = { x: 64, y: 0, z: 32 };
    const posMeters = new THREE.Vector3(
      sourcePos.x * VMF_INCHES_TO_METERS,
      sourcePos.z * VMF_INCHES_TO_METERS,
      sourcePos.y * VMF_INCHES_TO_METERS,
    );
    // Hammer: u = (dot(pos, uxyz)/scale + translation) / texSize
    const expectedU = (sourcePos.x / uAxis.scale + uAxis.translation) / VMF_DEFAULT_TEXTURE_SIZE;
    const expectedV =
      ((sourcePos.x * vAxis.x + sourcePos.y * vAxis.y + sourcePos.z * vAxis.z) / vAxis.scale + vAxis.translation) /
      VMF_DEFAULT_TEXTURE_SIZE;
    // Chisel flips V: our projector uses flipped axis so UV.v ≈ -HammerV
    const basis = resolveProjectionBasis(new THREE.Vector3(0, 1, 0), mapping);
    const uv = projectWorldPositionToUv(posMeters, basis, mapping);
    expect(uv.u).toBeCloseTo(expectedU, 4);
    expect(uv.v).toBeCloseTo(-expectedV, 4);
  });

  it('imports axis-aligned solid face mappings with custom axes', () => {
    const world = new VmfParser().parse(
      buildAxisAlignedWorldSolidVmf({ x: -32, y: -32, z: -32 }, { x: 32, y: 32, z: 32 }),
    );
    const built = new VmfBrushFromSides().build(world.solids[0]);
    expect(built).not.toBeNull();
    expect(built!.faceMappings.every((m) => m.uv && m.uv.u && m.uv.v)).toBe(true);
    const model = new SolidModel('VmfUv');
    const instance = model.addBoxBrush(2, SolidOperation.Additive);
    // Replace with imported topology + mappings
    instance.brush = built!.brush;
    instance.position.copy(built!.worldCenter);
    for (let i = 0; i < built!.faceMappings.length; i++) {
      instance.setFaceMapping(i, built!.faceMappings[i]);
    }
    instance.pushTransformToMesh();
    model.markDirty();
    model.rebuild(true);
    const uv = model.getResultMesh().geometry.getAttribute('uv');
    expect(uv).toBeDefined();
    expect(uv.count).toBeGreaterThan(0);
    for (let i = 0; i < uv.count; i++) {
      expect(Number.isFinite(uv.getX(i))).toBe(true);
      expect(Number.isFinite(uv.getY(i))).toBe(true);
    }
  });
});
