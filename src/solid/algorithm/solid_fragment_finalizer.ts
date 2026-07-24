import * as THREE from 'three';
import { SolidPlane } from '../brush/solid_plane.js';
import { SurfaceCategory } from '../types/surface_category.js';
import { shouldKeepSurfaceCategory, shouldReverseSurfaceWinding } from '../types/surface_category.js';
import type { PreparedBrush } from './solid_compile_types.js';
import { SolidCompiledPolygon } from './solid_compiled_polygon.js';
import { SolidFragmentRouter } from './solid_fragment_router.js';
import { SolidMembershipEvaluator } from './solid_membership_evaluator.js';

/**
 * Classifies fragments as solid boundaries and builds compiled polygons for
 * kept surface categories.
 */
export class SolidFragmentFinalizer {
  private readonly router: SolidFragmentRouter;
  private readonly membership: SolidMembershipEvaluator;

  /**
   * Creates a fragment finalizer.
   *
   * @param router Category router for fragment routing.
   * @param membership Membership evaluator for boundary tests.
   */
  constructor(router: SolidFragmentRouter, membership: SolidMembershipEvaluator) {
    this.router = router;
    this.membership = membership;
  }

  /**
   * Classifies a fragment and emits a compiled polygon when it is a boundary.
   *
   * @param fragment Fragment vertices.
   * @param facePlane Original face plane.
   * @param surfaceIndex Face surface index.
   * @param subject Subject prepared brush.
   * @param prepared All brushes.
   * @param subjectIndex Subject index.
   * @returns Compiled polygon or null when discarded.
   */
  finalizeFragment(
    fragment: THREE.Vector3[],
    facePlane: SolidPlane,
    surfaceIndex: number,
    subject: PreparedBrush,
    prepared: PreparedBrush[],
    subjectIndex: number,
  ): SolidCompiledPolygon | null {
    if (fragment.length < 3) return null;
    if (!this.membership.isBoundaryFragment(fragment, facePlane.normal, prepared)) {
      return null;
    }
    const category = this.router.routeFragmentCategory(fragment, facePlane.normal, prepared, subjectIndex);
    if (!shouldKeepSurfaceCategory(category)) return null;
    return this.buildCompiledPolygon(fragment, facePlane, surfaceIndex, subject, category);
  }

  /**
   * Builds a compiled polygon from a kept fragment.
   *
   * @param fragment Fragment vertices.
   * @param facePlane Original face plane.
   * @param surfaceIndex Face surface index.
   * @param subject Subject prepared brush.
   * @param category Routed surface category.
   * @returns Compiled polygon.
   */
  buildCompiledPolygon(
    fragment: THREE.Vector3[],
    facePlane: SolidPlane,
    surfaceIndex: number,
    subject: PreparedBrush,
    category: SurfaceCategory,
  ): SolidCompiledPolygon {
    const vertices = fragment.map((point) => point.clone());
    const normal = facePlane.normal.clone();
    if (shouldReverseSurfaceWinding(category)) {
      vertices.reverse();
      normal.negate();
    }
    return {
      vertices,
      normal,
      surfaceIndex,
      brushId: subject.instance.id,
      textureId: subject.instance.getSurfaceTextureId(surfaceIndex),
      category,
    };
  }
}
