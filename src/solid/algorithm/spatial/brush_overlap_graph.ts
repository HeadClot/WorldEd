import * as THREE from 'three';
import { BrushSpatialIndex } from './brush_spatial_index.js';
import { packSpatialCellKey } from './spatial_cell_key.js';

/** Entry used when building undirected AABB overlap adjacency. */
export interface OverlapBoundsEntry {
  /** Axis-aligned bounds in model space. */
  bounds: THREE.Box3;
  /** Output list filled with overlapping peer indices. */
  overlappingPeerIndices: number[];
}

/**
 * Builds undirected bounds-overlap adjacency for solid CSG peer filtering. Uses
 * a uniform grid so sparse maps stay near-linear instead of quadratic. Partial
 * updates prefer a persistent BrushSpatialIndex so large maps avoid
 * re-binning.
 */
export class BrushOverlapGraph {
  /**
   * Fills overlappingPeerIndices for each entry from padded AABB tests.
   *
   * @param entries Prepared brushes with empty overlap lists.
   * @param pad Extra margin added to each bounds test.
   * @param spatialIndex Optional index used as the full-build grid source.
   */
  static build(entries: OverlapBoundsEntry[], pad: number, spatialIndex?: BrushSpatialIndex): void {
    const count = entries.length;
    if (count === 0) {
      return;
    }
    if (count <= 32) {
      this.buildPairwise(entries, pad);
    } else if (spatialIndex && spatialIndex.getEntryCount() === count) {
      this.buildFromSpatialIndex(entries, pad, spatialIndex);
    } else {
      this.buildWithGrid(entries, pad);
    }
    this.sortPeerLists(entries);
  }

  /**
   * Rebuilds overlaps only for seed brushes against every entry, then restores
   * cached peers for clean brushes that do not touch any seed.
   *
   * @param entries Prepared brushes (overlap lists start empty).
   * @param pad Extra margin.
   * @param seedIndices Indices that moved or changed shape.
   * @param previousPeerIndices Previous undirected peer indices per entry.
   * @param spatialIndex Optional persistent index for seed neighbor queries.
   */
  static buildPartial(
    entries: OverlapBoundsEntry[],
    pad: number,
    seedIndices: ReadonlySet<number>,
    previousPeerIndices: readonly number[][],
    spatialIndex?: BrushSpatialIndex,
  ): void {
    if (seedIndices.size === 0 || seedIndices.size >= entries.length) {
      this.build(entries, pad, spatialIndex);
      return;
    }
    this.restorePreviousPeers(entries, seedIndices, previousPeerIndices);
    this.linkSeedsAgainstAll(entries, pad, seedIndices, spatialIndex);
    this.sortPeerLists(entries);
  }

  /**
   * Sorts each peer list ascending so CSG local walks stay in tree order
   * without per-fragment sorts.
   *
   * @param entries Bounds entries with filled peer lists.
   */
  private static sortPeerLists(entries: OverlapBoundsEntry[]): void {
    for (const entry of entries) {
      if (entry.overlappingPeerIndices.length > 1) {
        entry.overlappingPeerIndices.sort((left, right) => left - right);
      }
    }
  }

  /**
   * Restores previous peer lists for non-seed brushes, dropping stale seed
   * peers.
   *
   * @param entries Bounds entries.
   * @param seedIndices Changed brush indices.
   * @param previousPeerIndices Previous peer index lists.
   */
  private static restorePreviousPeers(
    entries: OverlapBoundsEntry[],
    seedIndices: ReadonlySet<number>,
    previousPeerIndices: readonly number[][],
  ): void {
    for (let index = 0; index < entries.length; index++) {
      if (seedIndices.has(index)) continue;
      const previous = previousPeerIndices[index] ?? [];
      for (const peerIndex of previous) {
        if (seedIndices.has(peerIndex)) continue;
        if (peerIndex < 0 || peerIndex >= entries.length) continue;
        entries[index]!.overlappingPeerIndices.push(peerIndex);
      }
    }
  }

  /**
   * Links each seed brush against overlapping peers and records undirected
   * edges. Prefers a persistent spatial index; otherwise builds a temporary
   * grid or pairwise scan.
   *
   * @param entries Bounds entries.
   * @param pad Overlap pad.
   * @param seedIndices Seed indices.
   * @param spatialIndex Optional persistent index.
   */
  private static linkSeedsAgainstAll(
    entries: OverlapBoundsEntry[],
    pad: number,
    seedIndices: ReadonlySet<number>,
    spatialIndex?: BrushSpatialIndex,
  ): void {
    if (entries.length <= 32 || seedIndices.size >= entries.length / 2) {
      this.linkSeedsPairwise(entries, pad, seedIndices);
      return;
    }
    if (spatialIndex && spatialIndex.getEntryCount() === entries.length) {
      this.linkSeedsWithSpatialIndex(entries, pad, seedIndices, spatialIndex);
      return;
    }
    this.linkSeedsWithTemporaryGrid(entries, pad, seedIndices);
  }

  /**
   * Links seeds using a persistent spatial index without re-binning all
   * brushes.
   *
   * @param entries Bounds entries.
   * @param pad Overlap pad.
   * @param seedIndices Seed indices.
   * @param spatialIndex Persistent index aligned with prepared order.
   */
  private static linkSeedsWithSpatialIndex(
    entries: OverlapBoundsEntry[],
    pad: number,
    seedIndices: ReadonlySet<number>,
    spatialIndex: BrushSpatialIndex,
  ): void {
    for (const seedIndex of seedIndices) {
      if (seedIndex < 0 || seedIndex >= entries.length) {
        continue;
      }
      this.linkOneSeedFromCandidates(
        entries,
        pad,
        seedIndex,
        spatialIndex.queryBounds(entries[seedIndex]!.bounds, seedIndex),
      );
    }
  }

  /**
   * Links seeds after binning all entries into a temporary grid.
   *
   * @param entries Bounds entries.
   * @param pad Overlap pad.
   * @param seedIndices Seed indices.
   */
  private static linkSeedsWithTemporaryGrid(
    entries: OverlapBoundsEntry[],
    pad: number,
    seedIndices: ReadonlySet<number>,
  ): void {
    const cellSize = this.chooseCellSize(entries);
    const cells = this.binEntriesIntoCells(entries, cellSize, pad);
    for (const seedIndex of seedIndices) {
      if (seedIndex < 0 || seedIndex >= entries.length) {
        continue;
      }
      const candidates = this.collectCellCandidates(cells, entries[seedIndex]!.bounds, cellSize, pad, seedIndex);
      this.linkOneSeedFromCandidates(entries, pad, seedIndex, candidates);
    }
  }

  /**
   * Records undirected overlap edges for one seed against candidate peers.
   *
   * @param entries Bounds entries.
   * @param pad Overlap pad.
   * @param seedIndex Seed prepared index.
   * @param candidates Candidate peer indices.
   */
  private static linkOneSeedFromCandidates(
    entries: OverlapBoundsEntry[],
    pad: number,
    seedIndex: number,
    candidates: readonly number[],
  ): void {
    const seedEntry = entries[seedIndex]!;
    for (const other of candidates) {
      if (!this.boundsOverlap(seedEntry.bounds, entries[other]!.bounds, pad)) {
        continue;
      }
      this.addUndirectedPeer(entries, seedIndex, other);
    }
  }

  /**
   * Builds full undirected adjacency by querying a persistent spatial index.
   *
   * @param entries Bounds entries.
   * @param pad Overlap pad.
   * @param spatialIndex Index aligned with prepared order.
   */
  private static buildFromSpatialIndex(
    entries: OverlapBoundsEntry[],
    pad: number,
    spatialIndex: BrushSpatialIndex,
  ): void {
    for (let index = 0; index < entries.length; index++) {
      const candidates = spatialIndex.queryBounds(entries[index]!.bounds, index);
      for (const other of candidates) {
        if (other <= index) {
          continue;
        }
        if (!this.boundsOverlap(entries[index]!.bounds, entries[other]!.bounds, pad)) {
          continue;
        }
        entries[index]!.overlappingPeerIndices.push(other);
        entries[other]!.overlappingPeerIndices.push(index);
      }
    }
  }

  /**
   * Pairwise seed linking for small scenes or large seed sets.
   *
   * @param entries Bounds entries.
   * @param pad Overlap pad.
   * @param seedIndices Seed indices.
   */
  private static linkSeedsPairwise(entries: OverlapBoundsEntry[], pad: number, seedIndices: ReadonlySet<number>): void {
    for (const seedIndex of seedIndices) {
      if (seedIndex < 0 || seedIndex >= entries.length) continue;
      const seedEntry = entries[seedIndex]!;
      for (let other = 0; other < entries.length; other++) {
        if (other === seedIndex) continue;
        if (!this.boundsOverlap(seedEntry.bounds, entries[other]!.bounds, pad)) {
          continue;
        }
        this.addUndirectedPeer(entries, seedIndex, other);
      }
    }
  }

  /**
   * Collects unique brush indices from grid cells covered by query bounds.
   *
   * @param cells Grid buckets.
   * @param bounds Query bounds.
   * @param cellSize Grid cell size.
   * @param pad Bounds pad.
   * @param excludeIndex Index to skip.
   * @returns Candidate peer indices.
   */
  private static collectCellCandidates(
    cells: Map<bigint, number[]>,
    bounds: THREE.Box3,
    cellSize: number,
    pad: number,
    excludeIndex: number,
  ): number[] {
    const minX = Math.floor((bounds.min.x - pad) / cellSize);
    const minY = Math.floor((bounds.min.y - pad) / cellSize);
    const minZ = Math.floor((bounds.min.z - pad) / cellSize);
    const maxX = Math.floor((bounds.max.x + pad) / cellSize);
    const maxY = Math.floor((bounds.max.y + pad) / cellSize);
    const maxZ = Math.floor((bounds.max.z + pad) / cellSize);
    const seen = new Set<number>();
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const bucket = cells.get(packSpatialCellKey(x, y, z));
          if (!bucket) continue;
          for (const index of bucket) {
            if (index === excludeIndex) continue;
            seen.add(index);
          }
        }
      }
    }
    return Array.from(seen);
  }

  /**
   * Adds an undirected overlap edge when missing.
   *
   * @param entries Bounds entries.
   * @param a First index.
   * @param b Second index.
   */
  private static addUndirectedPeer(entries: OverlapBoundsEntry[], a: number, b: number): void {
    const entryA = entries[a]!;
    const entryB = entries[b]!;
    if (!entryA.overlappingPeerIndices.includes(b)) {
      entryA.overlappingPeerIndices.push(b);
    }
    if (!entryB.overlappingPeerIndices.includes(a)) {
      entryB.overlappingPeerIndices.push(a);
    }
  }

  /**
   * Pairwise overlap for very small brush counts.
   *
   * @param entries Bounds entries.
   * @param pad Overlap pad.
   */
  private static buildPairwise(entries: OverlapBoundsEntry[], pad: number): void {
    const count = entries.length;
    for (let i = 0; i < count; i++) {
      const entryI = entries[i]!;
      for (let j = i + 1; j < count; j++) {
        const entryJ = entries[j]!;
        if (!this.boundsOverlap(entryI.bounds, entryJ.bounds, pad)) {
          continue;
        }
        entryI.overlappingPeerIndices.push(j);
        entryJ.overlappingPeerIndices.push(i);
      }
    }
  }

  /**
   * Grid-accelerated overlap for larger brush counts.
   *
   * @param entries Bounds entries.
   * @param pad Overlap pad.
   */
  private static buildWithGrid(entries: OverlapBoundsEntry[], pad: number): void {
    const cellSize = this.chooseCellSize(entries);
    const cells = this.binEntriesIntoCells(entries, cellSize, pad);
    const seenPairs = new Set<number>();
    for (const indices of cells.values()) {
      this.linkPairsInCell(entries, indices, pad, seenPairs);
    }
  }

  /**
   * Picks a grid cell size from average brush extent.
   *
   * @param entries Bounds entries.
   * @returns Positive cell edge length.
   */
  private static chooseCellSize(entries: OverlapBoundsEntry[]): number {
    let totalExtent = 0;
    for (const entry of entries) {
      const bounds = entry.bounds;
      const extentX = bounds.max.x - bounds.min.x;
      const extentY = bounds.max.y - bounds.min.y;
      const extentZ = bounds.max.z - bounds.min.z;
      totalExtent += Math.max(extentX, extentY, extentZ, 1e-3);
    }
    return Math.max(totalExtent / entries.length, 1e-3);
  }

  /**
   * Inserts each brush index into every grid cell its padded bounds cover.
   *
   * @param entries Bounds entries.
   * @param cellSize Grid cell edge length.
   * @param pad Bounds pad.
   * @returns Map of cell key to brush indices.
   */
  private static binEntriesIntoCells(
    entries: OverlapBoundsEntry[],
    cellSize: number,
    pad: number,
  ): Map<bigint, number[]> {
    const cells = new Map<bigint, number[]>();
    for (let index = 0; index < entries.length; index++) {
      this.insertEntryIntoCells(cells, entries[index]!.bounds, index, cellSize, pad);
    }
    return cells;
  }

  /**
   * Inserts one brush into all overlapped grid cells.
   *
   * @param cells Grid map.
   * @param bounds Brush bounds.
   * @param index Brush index.
   * @param cellSize Grid cell size.
   * @param pad Bounds pad.
   */
  private static insertEntryIntoCells(
    cells: Map<bigint, number[]>,
    bounds: THREE.Box3,
    index: number,
    cellSize: number,
    pad: number,
  ): void {
    const minX = Math.floor((bounds.min.x - pad) / cellSize);
    const minY = Math.floor((bounds.min.y - pad) / cellSize);
    const minZ = Math.floor((bounds.min.z - pad) / cellSize);
    const maxX = Math.floor((bounds.max.x + pad) / cellSize);
    const maxY = Math.floor((bounds.max.y + pad) / cellSize);
    const maxZ = Math.floor((bounds.max.z + pad) / cellSize);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const key = packSpatialCellKey(x, y, z);
          const bucket = cells.get(key);
          if (bucket) bucket.push(index);
          else cells.set(key, [index]);
        }
      }
    }
  }

  /**
   * Links overlapping pairs within one cell, deduping across cells.
   *
   * @param entries Bounds entries.
   * @param indices Brush indices in the cell.
   * @param pad Bounds pad.
   * @param seenPairs Pair keys already recorded.
   */
  private static linkPairsInCell(
    entries: OverlapBoundsEntry[],
    indices: number[],
    pad: number,
    seenPairs: Set<number>,
  ): void {
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = indices[i]!;
        const b = indices[j]!;
        const lo = a < b ? a : b;
        const hi = a < b ? b : a;
        const pairKey = lo * entries.length + hi;
        if (seenPairs.has(pairKey)) continue;
        if (!this.boundsOverlap(entries[a]!.bounds, entries[b]!.bounds, pad)) {
          continue;
        }
        seenPairs.add(pairKey);
        entries[a]!.overlappingPeerIndices.push(b);
        entries[b]!.overlappingPeerIndices.push(a);
      }
    }
  }

  /**
   * Returns whether two bounds overlap with padding.
   *
   * @param a First bounds.
   * @param b Second bounds.
   * @param pad Padding distance.
   * @returns True when they may touch or intersect.
   */
  private static boundsOverlap(a: THREE.Box3, b: THREE.Box3, pad: number): boolean {
    return !(
      a.max.x + pad < b.min.x ||
      a.min.x - pad > b.max.x ||
      a.max.y + pad < b.min.y ||
      a.min.y - pad > b.max.y ||
      a.max.z + pad < b.min.z ||
      a.min.z - pad > b.max.z
    );
  }
}
