import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BrushSpatialIndex } from '@/solid/algorithm/spatial/brush_spatial_index.js';
import { BrushOverlapGraph } from '@/solid/algorithm/spatial/brush_overlap_graph.js';

/**
 * Builds a sparse grid of non-overlapping unit boxes.
 *
 * @param count Number of boxes.
 * @param spacing Center spacing (must exceed size).
 * @param size Half-extent of each box.
 * @returns Bounds entries.
 */
function makeSparseGridEntries(count: number, spacing: number, size: number) {
  const entries = [];
  const columns = Math.ceil(Math.sqrt(count));
  for (let index = 0; index < count; index++) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const centerX = column * spacing;
    const centerZ = row * spacing;
    entries.push({
      bounds: new THREE.Box3(
        new THREE.Vector3(centerX - size, -size, centerZ - size),
        new THREE.Vector3(centerX + size, size, centerZ + size),
      ),
    });
  }
  return entries;
}

/** Unit tests for incremental brush spatial index updates. */
describe('BrushSpatialIndex incremental', () => {
  it('matches full rebuild after upsert of one brush among many', () => {
    const entries = makeSparseGridEntries(200, 5, 1);
    const pad = 0.01;
    const incremental = new BrushSpatialIndex(entries, pad);
    const moved = entries[0]!.bounds.clone().translate(new THREE.Vector3(spacingOffset(5, 1), 0, 0));
    incremental.upsert(0, moved);
    const fullEntries = entries.map((entry, index) =>
      index === 0 ? { bounds: moved.clone() } : { bounds: entry.bounds.clone() },
    );
    const full = new BrushSpatialIndex(fullEntries, pad);
    const query = moved.clone().expandByScalar(0.1);
    expect(sortIndices(incremental.queryBounds(query, -1))).toEqual(sortIndices(full.queryBounds(query, -1)));
  });

  it('returns no neighbors for a free-floating brush among 512 solids', () => {
    const entries = makeSparseGridEntries(512, 6, 1);
    const index = new BrushSpatialIndex(entries, 0.01);
    const freeBounds = new THREE.Box3(new THREE.Vector3(1000, 1000, 1000), new THREE.Vector3(1002, 1002, 1002));
    index.upsert(0, freeBounds);
    expect(index.queryBounds(freeBounds, 0)).toHaveLength(0);
  });

  it('finds a new neighbor after moving into contact', () => {
    const entries = makeSparseGridEntries(64, 5, 1);
    const index = new BrushSpatialIndex(entries, 0.01);
    const intoNeighbor = entries[0]!.bounds.clone().translate(new THREE.Vector3(4.5, 0, 0));
    index.upsert(0, intoNeighbor);
    const hits = index.queryBounds(intoNeighbor, 0);
    expect(hits).toContain(1);
  });

  it('clear removes all query hits', () => {
    const entries = makeSparseGridEntries(40, 5, 1);
    const index = new BrushSpatialIndex(entries, 0.01);
    index.clear();
    expect(index.getEntryCount()).toBe(0);
    expect(index.queryPoint(new THREE.Vector3(0, 0, 0))).toHaveLength(0);
  });
});

/** Unit tests for overlap graph using a persistent spatial index. */
describe('BrushOverlapGraph with persistent spatial index', () => {
  it('partial seed link matches full graph for a sparse grid', () => {
    const count = 80;
    const entries = makeSparseGridEntries(count, 5, 1).map((entry) => ({
      bounds: entry.bounds,
      overlappingPeerIndices: [] as number[],
    }));
    const pad = 0.01;
    const index = new BrushSpatialIndex(entries, pad);
    BrushOverlapGraph.build(entries, pad, index);
    const previous = entries.map((entry) => entry.overlappingPeerIndices.slice());
    for (const entry of entries) {
      entry.overlappingPeerIndices = [];
    }
    entries[0]!.bounds.translate(new THREE.Vector3(4.5, 0, 0));
    index.upsert(0, entries[0]!.bounds);
    BrushOverlapGraph.buildPartial(entries, pad, new Set([0]), previous, index);
    expect(entries[0]!.overlappingPeerIndices).toContain(1);
    expect(entries[1]!.overlappingPeerIndices).toContain(0);
    for (let indexBrush = 2; indexBrush < count; indexBrush++) {
      expect(entries[indexBrush]!.overlappingPeerIndices).not.toContain(0);
    }
  });
});

/**
 * Returns spacing offset that moves a box of the given size toward its
 * neighbor.
 *
 * @param spacing Grid spacing.
 * @param size Box half-extent.
 * @returns Translation along X.
 */
function spacingOffset(spacing: number, size: number): number {
  return spacing - size * 0.5;
}

/**
 * Sorts indices for stable comparison.
 *
 * @param indices Index list.
 * @returns Sorted copy.
 */
function sortIndices(indices: number[]): number[] {
  return indices.slice().sort((left, right) => left - right);
}
