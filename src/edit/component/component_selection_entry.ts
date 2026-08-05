/** Kinds of editable component a selection entry may address. */
export type ComponentSelectionKind = 'vertex' | 'edge' | 'face';

/** One selected component on a domain target (content mesh uuid or brush id). */
export interface ComponentSelectionEntry {
  /** Stable target identity (mesh uuid or solid brush id string). */
  targetId: string;
  /** Component kind. */
  kind: ComponentSelectionKind;
  /**
   * Vertex index, undirected edge key (`min:max`), or face index / surface
   * index as a decimal string.
   */
  componentKey: string;
}

/**
 * Builds an undirected edge key from two vertex indices.
 *
 * @param vertexIndexA First vertex index.
 * @param vertexIndexB Second vertex index.
 * @returns Canonical edge key.
 */
export function buildComponentEdgeKey(vertexIndexA: number, vertexIndexB: number): string {
  const low = Math.min(vertexIndexA, vertexIndexB);
  const high = Math.max(vertexIndexA, vertexIndexB);
  return `${low}:${high}`;
}

/**
 * Builds a stable selection identity for one component entry.
 *
 * @param entry Selection entry.
 * @returns Unique string key.
 */
export function buildComponentSelectionIdentity(entry: ComponentSelectionEntry): string {
  return `${entry.targetId}|${entry.kind}|${entry.componentKey}`;
}
