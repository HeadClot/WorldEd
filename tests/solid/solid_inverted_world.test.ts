import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelCodec } from '@/solid/io/solid_model_codec.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Builds a box brush instance at a world position.
 *
 * @param id Brush id.
 * @param size Box edge length.
 * @param operation CSG operation.
 * @param position Optional world position.
 * @returns Brush instance.
 */
function makeBox(id: string, size: number, operation: SolidOperation, position?: THREE.Vector3): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  if (position) {
    instance.position.copy(position);
    instance.pushTransformToMesh();
  }
  return instance;
}

describe('Solid inverted world CSG', () => {
  it('starts membership solid so a subtractive brush emits room surfaces', () => {
    const subtractive = makeBox('room', 2, SolidOperation.Subtractive);
    const compiler = new SolidCsgCompiler();
    const normal = compiler.compile([subtractive], { forceFull: true });
    const inverted = compiler.compile([subtractive], { forceFull: true, invertedWorld: true });
    expect(normal.length).toBe(0);
    expect(inverted.length).toBeGreaterThan(0);
  });

  it('rebuilds solid model geometry when inverted world is toggled', () => {
    const model = new SolidModel('InvertedRooms');
    model.addBoxBrush(2, SolidOperation.Subtractive);
    model.rebuild(true);
    const before = model.getResultMesh().geometry.getAttribute('position')?.count ?? 0;
    expect(before).toBe(0);
    model.setInvertedWorld(true);
    const after = model.getResultMesh().geometry.getAttribute('position')?.count ?? 0;
    expect(after).toBeGreaterThan(0);
    expect(model.isInvertedWorld()).toBe(true);
  });

  it('persists inverted world through codec encode/decode', () => {
    const model = new SolidModel('CodecInvert');
    model.addBoxBrush(2, SolidOperation.Subtractive);
    model.setInvertedWorld(true);
    const encoded = SolidModelCodec.encode(model);
    expect(encoded.invertedWorld).toBe(true);
    const restored = SolidModelCodec.decode(encoded, 'CodecInvertRestored');
    expect(restored.isInvertedWorld()).toBe(true);
    const positions = restored.getResultMesh().geometry.getAttribute('position');
    expect(positions).toBeTruthy();
    expect(positions!.count).toBeGreaterThan(0);
  });

  it('does not solidify a non-touching additive after a distant intersecting brush', () => {
    const a = makeBox('a', 2, SolidOperation.Additive, new THREE.Vector3(-10, 0, 0));
    const b = makeBox('b', 2, SolidOperation.Additive, new THREE.Vector3(0, 0, 0));
    const c = makeBox('c', 2, SolidOperation.Additive, new THREE.Vector3(10, 0, 0));
    const compiler = new SolidCsgCompiler();
    compiler.compile([a, b, c], { forceFull: true, invertedWorld: true });
    expect(compiler.getCachedPolygons('a')?.length ?? 0).toBe(0);
    expect(compiler.getCachedPolygons('b')?.length ?? 0).toBe(0);
    expect(compiler.getCachedPolygons('c')?.length ?? 0).toBe(0);

    b.operation = SolidOperation.Intersecting;
    compiler.compile([a, b, c], { forceFull: true, invertedWorld: true });
    expect(compiler.getCachedPolygons('b')?.length ?? 0).toBeGreaterThan(0);
    expect(compiler.getCachedPolygons('a')?.length ?? 0).toBe(0);
    expect(compiler.getCachedPolygons('c')?.length ?? 0).toBe(0);

    c.position.x += 0.25;
    compiler.compile([a, b, c], { dirtyBrushIds: ['c'], invertedWorld: true });
    expect(compiler.getCachedPolygons('c')?.length ?? 0).toBe(0);
  });
});
