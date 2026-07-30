import type { McpVec3 } from '@/ai/shared/mcp_protocol_types.js';

/** Coarse shape tags derived from world AABB size ratios. */
export type BrushShapeTag = 'thin_pole' | 'flat_panel' | 'tall' | 'long' | 'box';

/** Shape classification payload for AI tools. */
export interface BrushShapeInfo {
  shape: BrushShapeTag;
  /** Short human phrase, e.g. "thin vertical pole". */
  kind: string;
  /** One-line summary with size and center. */
  summary: string;
  size: McpVec3;
  center: McpVec3;
}

const THIN_RATIO = 3;
const FLAT_RATIO = 4;
const ELONGATED_RATIO = 1.75;

/**
 * Classifies a brush from world AABB size and center.
 *
 * @param size World AABB size.
 * @param center World AABB center.
 * @returns Shape tags and one-line summary.
 */
export function classifyBrushShape(size: McpVec3, center: McpVec3): BrushShapeInfo {
  const shape = pickShapeTag(size);
  const kind = shapeKindLabel(shape, size);
  const summary = buildShapeSummary(kind, size, center);
  return { shape, kind, summary, size, center };
}

/**
 * Picks a coarse shape tag from AABB extents.
 *
 * @param size World AABB size.
 * @returns Shape tag.
 */
export function pickShapeTag(size: McpVec3): BrushShapeTag {
  const { x, y, z } = absSize(size);
  const maxHorizontal = Math.max(x, z);
  const minHorizontal = Math.min(x, z);
  const minExtent = Math.min(x, y, z);
  const maxExtent = Math.max(x, y, z);
  if (isThinPole(x, y, z, maxHorizontal, minHorizontal)) return 'thin_pole';
  if (isFlatPanel(minExtent, maxExtent, x, y, z)) return 'flat_panel';
  if (y >= maxHorizontal * ELONGATED_RATIO) return 'tall';
  if (maxHorizontal >= y * ELONGATED_RATIO) return 'long';
  return 'box';
}

/**
 * Returns true when the brush is a thin vertical pole.
 *
 * @param x Size X.
 * @param y Size Y.
 * @param z Size Z.
 * @param maxHorizontal Larger of X/Z.
 * @param minHorizontal Smaller of X/Z.
 * @returns True for thin pole.
 */
function isThinPole(x: number, y: number, z: number, maxHorizontal: number, minHorizontal: number): boolean {
  if (y < maxHorizontal * THIN_RATIO) return false;
  if (maxHorizontal <= 0) return false;
  return maxHorizontal / Math.max(minHorizontal, 1e-6) <= 2.5 && Math.max(x, z) < y * 0.5;
}

/**
 * Returns true when one axis is a thin slab relative to the others.
 *
 * @param minExtent Smallest size component.
 * @param maxExtent Largest size component.
 * @param x Size X.
 * @param y Size Y.
 * @param z Size Z.
 * @returns True for flat panel.
 */
function isFlatPanel(minExtent: number, maxExtent: number, x: number, y: number, z: number): boolean {
  if (maxExtent <= 0) return false;
  if (maxExtent / Math.max(minExtent, 1e-6) < FLAT_RATIO) return false;
  const mid = [x, y, z].sort((a, b) => a - b)[1] ?? 0;
  return mid >= minExtent * 2;
}

/**
 * Builds a short kind phrase from a shape tag and size.
 *
 * @param shape Shape tag.
 * @param size World size.
 * @returns Human kind label.
 */
function shapeKindLabel(shape: BrushShapeTag, size: McpVec3): string {
  if (shape === 'thin_pole') return 'thin vertical pole';
  if (shape === 'flat_panel') return flatPanelLabel(size);
  if (shape === 'tall') return 'tall volume';
  if (shape === 'long') return 'long volume';
  return 'box';
}

/**
 * Labels a flat panel by which axis is thin.
 *
 * @param size World size.
 * @returns Kind phrase.
 */
function flatPanelLabel(size: McpVec3): string {
  const { x, y, z } = absSize(size);
  if (y <= x && y <= z) return 'flat panel / flag';
  if (x <= y && x <= z) return 'vertical panel (thin X)';
  return 'vertical panel (thin Z)';
}

/**
 * Builds a one-line summary for AI scanning.
 *
 * @param kind Kind phrase.
 * @param size World size.
 * @param center World center.
 * @returns Summary string.
 */
function buildShapeSummary(kind: string, size: McpVec3, center: McpVec3): string {
  const s = absSize(size);
  const sizeText = `${fmt(s.x)}×${fmt(s.y)}×${fmt(s.z)}`;
  const at = `(${fmt(center.x)}, ${fmt(center.y)}, ${fmt(center.z)})`;
  return `${kind}, size ${sizeText} at ${at}`;
}

/**
 * Absolute size components (guards against negative scale oddities).
 *
 * @param size Source size.
 * @returns Positive components.
 */
function absSize(size: McpVec3): McpVec3 {
  return { x: Math.abs(size.x), y: Math.abs(size.y), z: Math.abs(size.z) };
}

/**
 * Formats a number for short AI-facing text.
 *
 * @param value Number to format.
 * @returns Compact string.
 */
function fmt(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

/**
 * Returns whether a shape tag matches a filter token.
 *
 * @param shape Classified shape.
 * @param filter User filter (tall, thin, pole, flat, panel, box, long).
 * @returns True when the filter matches.
 */
export function shapeMatchesFilter(shape: BrushShapeTag, filter: string): boolean {
  const token = filter.trim().toLowerCase();
  if (!token || token === 'any') return true;
  if (token === shape) return true;
  if (token === 'thin' || token === 'pole') return shape === 'thin_pole';
  if (token === 'flat' || token === 'panel' || token === 'flag') return shape === 'flat_panel';
  if (token === 'tall') return shape === 'tall' || shape === 'thin_pole';
  if (token === 'long') return shape === 'long';
  if (token === 'box') return shape === 'box';
  return false;
}
