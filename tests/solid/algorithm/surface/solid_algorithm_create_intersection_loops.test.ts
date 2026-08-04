import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidAlgorithmCreateIntersectionLoops } from '@/solid/algorithm/surface/solid_algorithm_create_intersection_loops.js';
import { SolidAlgorithmPrepareBrushPair } from '@/solid/algorithm/surface/solid_algorithm_prepare_brush_pair.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';

/**
 * Builds a prepared box for intersection-loop tests.
 *
 * @param id Brush id.
 * @param size Box edge length.
 * @param position Optional world position.
 * @returns Prepared brush with empty peer list.
 */
function makePrepared(id: string, size: number, position?: THREE.Vector3): PreparedBrush {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, SolidOperation.Additive);
  if (position) {
    instance.position.copy(position);
  }
  const modelBrush = instance.getModelSpaceBrush();
  return {
    instance,
    brush: modelBrush,
    bounds: modelBrush.computeLocalBounds(),
    overlappingPeerIndices: [],
    operation: SolidOperation.Additive,
  };
}

/** CreateIntersectionLoops bounded loop generation for intersecting boxes. */
describe('SolidAlgorithmCreateIntersectionLoops', () => {
  it('builds bounded loops for two partially overlapping boxes', () => {
    const prepared = [makePrepared('a', 2), makePrepared('b', 2, new THREE.Vector3(1, 0, 0))];
    prepared[0]!.overlappingPeerIndices = [1];
    prepared[1]!.overlappingPeerIndices = [0];
    const pair = SolidAlgorithmPrepareBrushPair.prepare(prepared, 0, 1, 0.0006, 0.0006);
    expect(pair).not.toBeNull();
    expect(pair!.type).toBe(SolidAlgorithmIntersectionType.Intersection);
    const loops = SolidAlgorithmCreateIntersectionLoops.executePair(prepared, pair!);
    expect(loops.length).toBeGreaterThan(0);
    for (const loop of loops) {
      expect(loop.loopVertices.length).toBeGreaterThanOrEqual(3);
      const bounds = new THREE.Box3().setFromPoints(loop.loopVertices);
      const size = bounds.getSize(new THREE.Vector3());
      expect(size.x).toBeLessThan(3);
      expect(size.y).toBeLessThan(3);
      expect(size.z).toBeLessThan(3);
    }
  });

  it('produces subject-owned loops via createForSubject', () => {
    const prepared = [makePrepared('a', 2), makePrepared('b', 1, new THREE.Vector3(0.5, 0.5, 0))];
    prepared[0]!.overlappingPeerIndices = [1];
    prepared[1]!.overlappingPeerIndices = [0];
    const loops = SolidAlgorithmCreateIntersectionLoops.createForSubject(prepared, 0, [1]);
    expect(loops.every((loop) => loop.subjectBrushIndex === 0)).toBe(true);
    expect(loops.some((loop) => loop.peerBrushIndex === 1)).toBe(true);
  });

  it('returns no pair for clearly separated boxes', () => {
    const prepared = [makePrepared('a', 1), makePrepared('b', 1, new THREE.Vector3(10, 0, 0))];
    prepared[0]!.overlappingPeerIndices = [1];
    prepared[1]!.overlappingPeerIndices = [0];
    const pair = SolidAlgorithmPrepareBrushPair.prepare(prepared, 0, 1, 0.0006, 0.0006);
    expect(pair).toBeNull();
  });
});
