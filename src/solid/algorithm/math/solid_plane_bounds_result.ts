/**
 * Result of classifying an axis-aligned bounds against a plane. Matches Chisel
 * IntersectionResult used by plane/bounds early outs.
 */
export enum SolidPlaneBoundsResult {
  Intersecting = 0,
  Inside = 1,
  Outside = 2,
}
