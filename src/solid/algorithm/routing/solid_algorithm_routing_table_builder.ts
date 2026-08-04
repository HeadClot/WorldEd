import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import type { SolidCsgTree } from '@/solid/algorithm/compile/solid_csg_tree.js';
import { SolidAlgorithmCompactHierarchyBuilder } from './solid_algorithm_compact_hierarchy_builder.js';
import { SolidAlgorithmCreateRoutingTableJob } from './solid_algorithm_create_routing_table_job.js';
import { SolidAlgorithmRoutingTable } from './solid_algorithm_routing_table.js';
import { SOLID_BOUNDS_EPSILON, SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';

/**
 * Builds CreateRoutingTableJob routing tables for solid CSG subjects. Prefer
 * SolidAlgorithmRoutingTableCache in hot paths so hierarchy is shared.
 */
export class SolidAlgorithmRoutingTableBuilder {
  /**
   * Builds a routing table for one subject brush.
   *
   * @param prepared All prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param _peerIndices Unused; touch set comes from subject overlap peers.
   * @param tree CSG tree (flat or hierarchical).
   * @param invertedWorld Whether CSG uses inverted world (infinite first).
   * @param _unusedLegacyFullWalk Kept for call-site compatibility.
   * @returns Optimized routing table.
   */
  static buildForSubject(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    _peerIndices: readonly number[],
    tree: SolidCsgTree,
    invertedWorld: boolean,
    _unusedLegacyFullWalk: boolean = false,
  ): SolidAlgorithmRoutingTable {
    void _peerIndices;
    void _unusedLegacyFullWalk;
    const hierarchy = SolidAlgorithmCompactHierarchyBuilder.build(tree, invertedWorld);
    return SolidAlgorithmCreateRoutingTableJob.buildForSubject(
      prepared,
      subjectIndex,
      hierarchy,
      invertedWorld,
      SOLID_BOUNDS_EPSILON,
      SOLID_FAT_PLANE_EPSILON,
    );
  }
}
