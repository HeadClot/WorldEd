import * as THREE from 'three';
import { SurfaceCategory } from '../types/surface_category.js';
import { BrushMembership } from './brush_membership.js';
import type { PreparedBrush } from './solid_compile_types.js';
import { SolidCsgTree } from './solid_csg_tree.js';
import { SolidCsgTreeEvaluator } from './solid_csg_tree_evaluator.js';
import type { SolidRoutingTable } from './solid_routing_table.js';
import { SolidRoutingTableCache } from './solid_routing_table_cache.js';

/**
 * Routes fragment surface categories through ordered brush operations.
 *
 * Flat CSG (no groups) uses Sander-style per-subject routing tables: boolean
 * operations are baked into compact lookup rows over the subject and its touch
 * peers (or the full ordered list when sequential ∩ requires it).
 *
 * Hierarchical CSG always walks the branch/leaf tree: children of a group
 * combine among themselves starting from empty, then the branch is applied once
 * to the parent with the group's operation. Flattening group leaves into a
 * single linear op chain is incorrect — an ∩ inside a group would then clip
 * sibling brushes outside that group.
 */
export class SolidFragmentRouter {
  private hasIntersectingOperations = false;
  private invertedWorld = false;
  private csgTree: SolidCsgTree | null = null;
  private readonly routingTables = new SolidRoutingTableCache();
  private readonly scratchCentroid = new THREE.Vector3();

  /**
   * Updates whether intersecting operations force full-list walks when building
   * flat routing tables. Hierarchical routing ignores this flag and always uses
   * the tree evaluator with a peer-local relevant set.
   *
   * @param value True when any brush uses intersecting CSG.
   */
  setHasIntersectingOperations(value: boolean): void {
    this.hasIntersectingOperations = value;
  }

  /**
   * Sets whether routing starts as solid (inverted world).
   *
   * @param value True when the world begins full.
   */
  setInvertedWorld(value: boolean): void {
    this.invertedWorld = value;
  }

  /**
   * Installs the hierarchical CSG tree for the current compile.
   *
   * @param tree Hierarchical tree, or null for flat routing.
   */
  setCsgTree(tree: SolidCsgTree | null): void {
    this.csgTree = tree;
  }

  /** Clears cached routing tables (full rebuild or empty compile). */
  clearRoutingTables(): void {
    this.routingTables.clear();
  }

  /**
   * Drops one brush's routing table after removal or op change.
   *
   * @param brushId Brush instance id.
   */
  invalidateRoutingTable(brushId: string): void {
    this.routingTables.invalidateBrush(brushId);
  }

  /**
   * Routes a fragment's categories through brush operations.
   *
   * Non-flat trees always use hierarchical evaluation (including when the tree
   * contains ∩). Flat trees use optimized Sander routing tables.
   *
   * @param fragment Fragment polygon.
   * @param normal Face normal.
   * @param prepared All brushes.
   * @param subjectIndex Subject brush index.
   * @returns Final routed category.
   */
  routeFragmentCategory(
    fragment: THREE.Vector3[],
    normal: THREE.Vector3,
    prepared: PreparedBrush[],
    subjectIndex: number,
  ): SurfaceCategory {
    BrushMembership.polygonCentroidInto(fragment, this.scratchCentroid);
    if (this.csgTree && !this.csgTree.isFlat) {
      return this.routeHierarchicalWithPeers(normal, prepared, subjectIndex);
    }
    return this.routeWithTable(normal, prepared, subjectIndex);
  }

  /**
   * Hierarchical routing with peer filtering for compound groups. Group-local
   * operations (including ∩) only affect the compound solid of that branch.
   * Leaves outside the relevant set count as Outside, which is safe for convex
   * brushes whose bounds do not touch the subject.
   *
   * @param normal Face normal.
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject index.
   * @returns Final category.
   */
  private routeHierarchicalWithPeers(
    normal: THREE.Vector3,
    prepared: PreparedBrush[],
    subjectIndex: number,
  ): SurfaceCategory {
    const tree = this.csgTree;
    if (!tree) {
      return this.routeWithTable(normal, prepared, subjectIndex);
    }
    const relevant = this.collectHierarchicalRelevantSet(prepared, subjectIndex);
    return SolidCsgTreeEvaluator.routeCategoryFiltered(
      this.scratchCentroid,
      normal,
      prepared,
      tree,
      subjectIndex,
      this.invertedWorld,
      relevant,
    );
  }

  /**
   * Routes using a cached Sander-style routing table (flat CSG only).
   *
   * @param normal Face normal.
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject index.
   * @returns Final category.
   */
  private routeWithTable(normal: THREE.Vector3, prepared: PreparedBrush[], subjectIndex: number): SurfaceCategory {
    const table = this.resolveTable(prepared, subjectIndex);
    return table.route((preparedIndex) => this.classifyForTable(preparedIndex, subjectIndex, prepared, normal));
  }

  /**
   * Resolves or builds the routing table for a subject. Intended for flat CSG
   * only; hierarchical trees yield an empty table from the builder and are
   * routed through routeHierarchicalWithPeers instead.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject index.
   * @returns Routing table.
   */
  private resolveTable(prepared: PreparedBrush[], subjectIndex: number): SolidRoutingTable {
    const tree = this.csgTree ?? SolidCsgTree.fromPreparedFlat(prepared);
    return this.routingTables.getOrBuild(
      prepared,
      subjectIndex,
      tree,
      this.invertedWorld,
      this.hasIntersectingOperations,
    );
  }

  /**
   * Classifies the fragment centroid against one table step brush.
   *
   * @param preparedIndex Step brush index.
   * @param subjectIndex Subject index.
   * @param prepared Prepared brushes.
   * @param normal Face normal.
   * @returns Relative category.
   */
  private classifyForTable(
    preparedIndex: number,
    subjectIndex: number,
    prepared: PreparedBrush[],
    normal: THREE.Vector3,
  ): SurfaceCategory {
    if (preparedIndex === subjectIndex) {
      return SurfaceCategory.SelfAligned;
    }
    const peer = prepared[preparedIndex];
    if (!peer) return SurfaceCategory.Outside;
    return BrushMembership.classifyPoint(this.scratchCentroid, peer.brush, normal);
  }

  /**
   * Relevant prepared indices for hierarchical peer-local evaluation. Hierarchy
   * isolates operations inside groups, so sequential-∩ full-list walks are not
   * required — only the subject and brushes whose bounds touch it.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject index.
   * @returns Relevant index set.
   */
  private collectHierarchicalRelevantSet(prepared: PreparedBrush[], subjectIndex: number): Set<number> {
    const subject = prepared[subjectIndex];
    const relevant = new Set<number>(subject?.overlappingPeerIndices ?? []);
    relevant.add(subjectIndex);
    return relevant;
  }
}
