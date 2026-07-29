import { SurfaceCategory } from '../types/surface_category.js';

/** Number of surface categories (table columns / final outputs). */
export const SOLID_ROUTING_CATEGORY_COUNT = 6;

/**
 * One brush step in a Sander-style routing table. Each row maps the six
 * relative-category columns to either the next step's row index or a final
 * SurfaceCategory on the last step.
 */
export interface SolidRoutingStep {
  /** Prepared-brush index classified at this step. */
  preparedIndex: number;
  /**
   * Rows[rowIndex][relativeCategory] → next row index (non-final steps) or
   * SurfaceCategory value (final step).
   */
  rows: Uint8Array[];
}

/**
 * Per-subject CSG routing table: pre-baked boolean operations over the ordered
 * brushes that affect one subject. Categorization becomes classify → table
 * lookup per step instead of re-deriving operation tables every fragment.
 */
export class SolidRoutingTable {
  readonly steps: readonly SolidRoutingStep[];
  readonly invertedWorld: boolean;

  /**
   * Creates a routing table.
   *
   * @param steps Ordered brush steps (may be empty).
   * @param invertedWorld Whether routing starts solid.
   */
  constructor(steps: SolidRoutingStep[], invertedWorld: boolean) {
    this.steps = steps;
    this.invertedWorld = invertedWorld;
  }

  /**
   * Routes a fragment by classifying against each step brush and looking up the
   * pre-baked table.
   *
   * @param classify Returns relative category for a prepared brush index
   *   (SelfAligned when the brush is the subject).
   * @returns Final surface category.
   */
  route(classify: (preparedIndex: number) => SurfaceCategory): SurfaceCategory {
    if (this.steps.length === 0) {
      return this.invertedWorld ? SurfaceCategory.Inside : SurfaceCategory.Outside;
    }
    let rowIndex = 0;
    const lastStepIndex = this.steps.length - 1;
    for (let stepIndex = 0; stepIndex < this.steps.length; stepIndex++) {
      const step = this.steps[stepIndex]!;
      const row = step.rows[rowIndex];
      if (!row) {
        return this.invertedWorld ? SurfaceCategory.Inside : SurfaceCategory.Outside;
      }
      const relative = classify(step.preparedIndex);
      const next = row[relative] ?? SurfaceCategory.Outside;
      if (stepIndex === lastStepIndex) {
        return next as SurfaceCategory;
      }
      rowIndex = next;
    }
    return SurfaceCategory.Outside;
  }

  /**
   * Returns total row count across all steps (for tests / diagnostics).
   *
   * @returns Sum of rows per step.
   */
  totalRowCount(): number {
    let count = 0;
    for (const step of this.steps) {
      count += step.rows.length;
    }
    return count;
  }
}
