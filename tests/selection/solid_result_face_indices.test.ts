import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '../../src/solid/model/solid_model.js';
import {
  expandFaceSelectionIndices,
  findSameSolidBrushSurfaceIndices
} from '../../src/selection/solid_result_face_indices.js';
import { findConnectedCoplanarFaceIndices } from '../../src/selection/triangle_geometry_utils.js';
import { FaceSelectionManager } from '../../src/selection/face_selection_manager.js';
import { groupSelectionsIntoFaceRegions } from '../../src/selection/face_region_grouper.js';

/**
 * Per-triangle solid source row used in tests.
 */
interface SourceRow {
  brushId: string;
  surfaceIndex: number;
}

/**
 * Unit tests for solid-aware face selection (per brush face, not coplanar flood).
 */
describe('solid result face indices', () => {
  it('keeps adjacent coplanar wall brushes as separate selectable faces', () => {
    const { result, leftId, rightId } = buildAdjacentWallBrushes();
    const sources = readSources(result);
    const leftSeed = findSeedForBrush(sources, leftId);
    const rightSeed = findSeedForBrush(sources, rightId);

    const coplanar = findConnectedCoplanarFaceIndices(result.geometry, leftSeed);
    const coplanarBrushIds = uniqueBrushIds(sources, coplanar);
    expect(coplanarBrushIds.has(leftId)).toBe(true);
    expect(coplanarBrushIds.has(rightId)).toBe(true);

    const expanded = expandFaceSelectionIndices(result, leftSeed);
    const expandedIds = uniqueBrushIds(sources, expanded);
    expect(expandedIds.size).toBe(1);
    expect(expandedIds.has(leftId)).toBe(true);
    expect(expanded.every((index) => sources[index].surfaceIndex === sources[leftSeed].surfaceIndex)).toBe(
      true
    );

    const other = expandFaceSelectionIndices(result, rightSeed);
    expect(uniqueBrushIds(sources, other).has(rightId)).toBe(true);
    expect(uniqueBrushIds(sources, other).has(leftId)).toBe(false);
  });

  it('keeps a carpet/detail floor pad separate from the neighboring floor top', () => {
    const { result, floorId, carpetId } = buildAdjacentFloorTiles();
    const sources = readSources(result);
    const carpetSeed = findTopFaceSeed(result, sources, carpetId);
    const floorSeed = findTopFaceSeed(result, sources, floorId);

    const coplanar = findConnectedCoplanarFaceIndices(result.geometry, carpetSeed);
    const coplanarIds = uniqueBrushIds(sources, coplanar);
    expect(coplanarIds.has(carpetId)).toBe(true);
    expect(coplanarIds.has(floorId)).toBe(true);

    const carpetOnly = expandFaceSelectionIndices(result, carpetSeed);
    expect(uniqueBrushIds(sources, carpetOnly).size).toBe(1);
    expect(uniqueBrushIds(sources, carpetOnly).has(carpetId)).toBe(true);

    const floorOnly = expandFaceSelectionIndices(result, floorSeed);
    expect(uniqueBrushIds(sources, floorOnly).has(floorId)).toBe(true);
    expect(uniqueBrushIds(sources, floorOnly).has(carpetId)).toBe(false);
  });

  it('selects only one brush face through FaceSelectionManager', () => {
    const { result, leftId, rightId } = buildAdjacentWallBrushes();
    const sources = readSources(result);
    const leftSeed = findSeedForBrush(sources, leftId);
    const manager = new FaceSelectionManager();
    manager.selectFace(result, leftSeed, false);
    const selected = manager.getSelectedFaces().map((entry) => entry.faceIndex);
    const selectedIds = uniqueBrushIds(sources, selected);
    expect(selectedIds.size).toBe(1);
    expect(selectedIds.has(leftId)).toBe(true);
    expect(selectedIds.has(rightId)).toBe(false);
  });

  it('splits multi-brush coplanar selection into separate extrusion regions', () => {
    const { result, leftId, rightId } = buildAdjacentWallBrushes();
    const sources = readSources(result);
    const leftSeed = findSeedForBrush(sources, leftId);
    const rightSeed = findSeedForBrush(sources, rightId);
    const leftFaces = expandFaceSelectionIndices(result, leftSeed);
    const rightFaces = expandFaceSelectionIndices(result, rightSeed);
    const selections = [...leftFaces, ...rightFaces].map((faceIndex) => ({
      mesh: result,
      faceIndex
    }));
    const regions = groupSelectionsIntoFaceRegions(selections);
    expect(regions.length).toBe(2);
    const regionBrushSets = regions.map((region) =>
      uniqueBrushIds(sources, region.faceIndices)
    );
    expect(regionBrushSets.some((set) => set.size === 1 && set.has(leftId))).toBe(
      true
    );
    expect(regionBrushSets.some((set) => set.size === 1 && set.has(rightId))).toBe(
      true
    );
  });

  it('falls back to coplanar expansion for ordinary non-solid meshes', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const expanded = expandFaceSelectionIndices(mesh, 0);
    expect(expanded.length).toBe(2);
    expect(findSameSolidBrushSurfaceIndices(mesh, 0)).toBeNull();
  });

  it('does not coplanar-flood when solid sources exist but seed row is missing', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] = [
      { brushId: 'only-zero', surfaceIndex: 0 }
    ];
    const expanded = expandFaceSelectionIndices(mesh, 5);
    expect(expanded).toEqual([5]);
  });
});

/**
 * Builds two size-2 cubes that touch and share a coplanar front wall plane.
 * @returns Result mesh and brush ids.
 */
function buildAdjacentWallBrushes(): {
  result: THREE.Mesh;
  leftId: string;
  rightId: string;
} {
  const model = new SolidModel('AdjacentWalls');
  const left = model.addBoxBrush(2, SolidOperation.Additive);
  const right = model.addBoxBrush(2, SolidOperation.Additive);
  left.position.set(-1, 0, 0);
  right.position.set(1, 0, 0);
  left.pushTransformToMesh();
  right.pushTransformToMesh();
  model.syncBrushesFromScene();
  model.rebuild(true);
  return {
    result: model.getResultMesh(),
    leftId: left.id,
    rightId: right.id
  };
}

/**
 * Builds two adjacent floor tiles with coplanar tops sharing an edge.
 * Models a carpet/detail pad next to a larger floor surface.
 * @returns Result mesh and brush ids.
 */
function buildAdjacentFloorTiles(): {
  result: THREE.Mesh;
  floorId: string;
  carpetId: string;
} {
  const model = new SolidModel('CarpetFloor');
  const floor = model.addBoxBrush(2, SolidOperation.Additive);
  const carpet = model.addBoxBrush(2, SolidOperation.Additive);
  floor.position.set(-1, 0, 0);
  carpet.position.set(1, 0, 0);
  floor.pushTransformToMesh();
  carpet.pushTransformToMesh();
  model.syncBrushesFromScene();
  model.rebuild(true);
  return {
    result: model.getResultMesh(),
    floorId: floor.id,
    carpetId: carpet.id
  };
}

/**
 * Reads solid triangle sources from a result mesh.
 * @param mesh Solid result mesh.
 * @returns Source rows.
 */
function readSources(mesh: THREE.Mesh): SourceRow[] {
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as
    | SourceRow[]
    | undefined;
  expect(sources?.length).toBeGreaterThan(0);
  return sources!;
}

/**
 * Finds any triangle seed belonging to a brush.
 * @param sources Source table.
 * @param brushId Target brush.
 * @returns Triangle index.
 */
function findSeedForBrush(sources: SourceRow[], brushId: string): number {
  const index = sources.findIndex((source) => source.brushId === brushId);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

/**
 * Finds a top-facing (+Y) triangle seed for a brush when possible.
 * @param mesh Result mesh.
 * @param sources Source table.
 * @param brushId Target brush.
 * @returns Triangle index.
 */
function findTopFaceSeed(
  mesh: THREE.Mesh,
  sources: SourceRow[],
  brushId: string
): number {
  const up = new THREE.Vector3(0, 1, 0);
  for (let index = 0; index < sources.length; index++) {
    if (sources[index].brushId !== brushId) continue;
    const normal = new THREE.Vector3();
    const positions = mesh.geometry.getAttribute('position');
    const base = index * 3;
    const a = new THREE.Vector3().fromBufferAttribute(positions, base);
    const b = new THREE.Vector3().fromBufferAttribute(positions, base + 1);
    const c = new THREE.Vector3().fromBufferAttribute(positions, base + 2);
    normal.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    if (normal.dot(up) > 0.9) return index;
  }
  return findSeedForBrush(sources, brushId);
}

/**
 * Collects unique brush ids for a set of triangle indices.
 * @param sources Source table.
 * @param indices Triangle indices.
 * @returns Set of brush ids.
 */
function uniqueBrushIds(sources: SourceRow[], indices: number[]): Set<string> {
  const ids = new Set<string>();
  for (const index of indices) {
    const source = sources[index];
    if (source?.brushId) ids.add(source.brushId);
  }
  return ids;
}
