/**
 * Relationship between the processed subject brush and another hierarchy node.
 * Matches IntersectionType used by CreateRoutingTableJob.
 */
export enum SolidAlgorithmIntersectionType {
  NoIntersection = 0,
  Intersection = 1,
  /** Processed subject is entirely inside the other brush. */
  AInsideB = 2,
  /** Other brush is entirely inside the processed subject. */
  BInsideA = 3,
  InvalidValue = 4,
}
