import { createViewportLeafPayload, type AreaEditorType, type AreaLeafPayload } from './area_editor_type.js';
import { isAreaSplitDirection, type AreaSplitDirection } from './area_split_direction.js';
import { clampAreaSplitRatio } from './area_layout_tree.js';
import { createAreaLeafNode, createAreaSplitNode, isAreaLeafNode, type AreaTreeNode } from './area_tree_node.js';
import { parseViewportKind, type ViewportKind } from '../../../viewports/viewport_kind.js';
import {
  parseViewportCameraSnapshot,
  type ViewportCameraSnapshot,
} from '../../../viewports/viewport_camera_snapshot.js';

/** Current serialized layout format version. */
export const AREA_LAYOUT_SERIAL_VERSION = 1;

/** JSON-safe leaf payload. */
export interface SerializedAreaLeaf {
  type: 'leaf';
  areaId: string;
  editorType: string;
  viewportKind?: string;
  /** Optional camera pose remembered for this pane across workspace switches. */
  camera?: ViewportCameraSnapshot;
}

/** JSON-safe split payload. */
export interface SerializedAreaSplit {
  type: 'split';
  direction: string;
  ratio: number;
  first: SerializedAreaNode;
  second: SerializedAreaNode;
}

/** JSON-safe tree node. */
export type SerializedAreaNode = SerializedAreaLeaf | SerializedAreaSplit;

/** Versioned document wrapping a layout tree. */
export interface SerializedAreaLayout {
  version: number;
  root: SerializedAreaNode;
}

/**
 * Serializes a layout tree into a versioned plain object.
 *
 * @param root Layout tree root.
 * @returns Serializable document.
 */
export function serializeAreaLayout(root: AreaTreeNode): SerializedAreaLayout {
  return {
    version: AREA_LAYOUT_SERIAL_VERSION,
    root: serializeNode(root),
  };
}

/**
 * Deserializes a layout document. Returns null when the document is invalid.
 *
 * @param value Unknown JSON value.
 * @returns Tree root or null.
 */
export function deserializeAreaLayout(value: unknown): AreaTreeNode | null {
  if (!isObject(value)) return null;
  const version = value['version'];
  if (version !== AREA_LAYOUT_SERIAL_VERSION) return null;
  const root = value['root'];
  return deserializeNode(root);
}

/**
 * Serializes one tree node.
 *
 * @param node Tree node.
 * @returns Serialized node.
 */
function serializeNode(node: AreaTreeNode): SerializedAreaNode {
  if (isAreaLeafNode(node)) {
    return serializeLeaf(node.payload);
  }
  return {
    type: 'split',
    direction: node.direction,
    ratio: node.ratio,
    first: serializeNode(node.first),
    second: serializeNode(node.second),
  };
}

/**
 * Serializes a leaf payload.
 *
 * @param payload Leaf payload.
 * @returns Serialized leaf.
 */
function serializeLeaf(payload: AreaLeafPayload): SerializedAreaLeaf {
  const leaf: SerializedAreaLeaf = {
    type: 'leaf',
    areaId: payload.areaId,
    editorType: payload.editorType,
  };
  if (payload.viewportKind !== undefined) {
    leaf.viewportKind = payload.viewportKind;
  }
  return leaf;
}

/**
 * Attaches live camera snapshots to each viewport leaf in a layout document.
 * Mutates the document in place and returns it for chaining.
 *
 * @param layout Serialized layout tree.
 * @param getCamera Snapshot provider for each area id.
 * @returns The same layout document with cameras filled when available.
 */
export function attachCamerasToSerializedLayout(
  layout: SerializedAreaLayout,
  getCamera: (areaId: string) => ViewportCameraSnapshot | null,
): SerializedAreaLayout {
  attachCamerasToNode(layout.root, getCamera);
  return layout;
}

/**
 * Walks a serialized tree and applies camera snapshots to matching area ids.
 *
 * @param layout Layout document that may contain per-leaf camera data.
 * @param applyCamera Restores a snapshot onto a live pane.
 */
export function restoreCamerasFromSerializedLayout(
  layout: SerializedAreaLayout,
  applyCamera: (areaId: string, camera: ViewportCameraSnapshot) => void,
): void {
  restoreCamerasFromNode(layout.root, applyCamera);
}

/**
 * Recursively attaches cameras to leaf nodes.
 *
 * @param node Serialized node.
 * @param getCamera Snapshot provider.
 */
function attachCamerasToNode(
  node: SerializedAreaNode,
  getCamera: (areaId: string) => ViewportCameraSnapshot | null,
): void {
  if (node.type === 'leaf') {
    const snapshot = getCamera(node.areaId);
    if (snapshot) {
      node.camera = snapshot;
    } else {
      delete node.camera;
    }
    return;
  }
  attachCamerasToNode(node.first, getCamera);
  attachCamerasToNode(node.second, getCamera);
}

/**
 * Recursively restores cameras from leaf nodes.
 *
 * @param node Serialized node.
 * @param applyCamera Restore callback.
 */
function restoreCamerasFromNode(
  node: SerializedAreaNode,
  applyCamera: (areaId: string, camera: ViewportCameraSnapshot) => void,
): void {
  if (node.type === 'leaf') {
    const camera = parseViewportCameraSnapshot(node.camera);
    if (camera) applyCamera(node.areaId, camera);
    return;
  }
  restoreCamerasFromNode(node.first, applyCamera);
  restoreCamerasFromNode(node.second, applyCamera);
}

/**
 * Deserializes one tree node.
 *
 * @param value Unknown node value.
 * @returns Tree node or null.
 */
function deserializeNode(value: unknown): AreaTreeNode | null {
  if (!isObject(value)) return null;
  const type = value['type'];
  if (type === 'leaf') return deserializeLeaf(value);
  if (type === 'split') return deserializeSplit(value);
  return null;
}

/**
 * Deserializes a leaf node.
 *
 * @param value Object with leaf fields.
 * @returns Leaf node or null.
 */
function deserializeLeaf(value: Record<string, unknown>): AreaTreeNode | null {
  const areaId = value['areaId'];
  const editorType = value['editorType'];
  if (typeof areaId !== 'string' || areaId.length === 0) return null;
  if (editorType !== 'viewport') return null;
  const viewportKind = parseOptionalViewportKind(value['viewportKind']);
  if (!viewportKind) return null;
  return createAreaLeafNode(createViewportLeafPayload(areaId, viewportKind));
}

/**
 * Deserializes a split node.
 *
 * @param value Object with split fields.
 * @returns Split node or null.
 */
function deserializeSplit(value: Record<string, unknown>): AreaTreeNode | null {
  const direction = value['direction'];
  const ratio = value['ratio'];
  if (!isAreaSplitDirection(direction)) return null;
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
  const first = deserializeNode(value['first']);
  const second = deserializeNode(value['second']);
  if (!first || !second) return null;
  return createAreaSplitNode(direction as AreaSplitDirection, clampAreaSplitRatio(ratio), first, second);
}

/**
 * Parses an optional viewport kind string.
 *
 * @param value Unknown kind value.
 * @returns Viewport kind or null.
 */
function parseOptionalViewportKind(value: unknown): ViewportKind | null {
  if (typeof value !== 'string') return null;
  return parseViewportKind(value);
}

/**
 * Type guard for plain objects.
 *
 * @param value Unknown value.
 * @returns True for non-null objects.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Returns whether a string is a known area editor type (extensible).
 *
 * @param value Candidate type.
 * @returns True for supported types.
 */
export function isSupportedAreaEditorType(value: string): value is AreaEditorType {
  return value === 'viewport';
}
