import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';

/** Lookup result for a brush and its owning solid model. */
export interface BrushLookup {
  model: SolidModel;
  brush: SolidBrushInstance;
}

/** Lookup result for a solid CSG group under a solid model. */
export interface CsgGroupLookup {
  model: SolidModel;
  group: THREE.Group;
}

/** Brush mesh or solid CSG group under a solid model. */
export interface SolidHierarchyNodeLookup {
  model: SolidModel;
  node: THREE.Object3D;
  kind: 'brush' | 'csg_group';
}

/**
 * Lists solid models registered under the world root.
 *
 * @param worldObject Scene world group.
 * @returns Solid models in traversal discovery order.
 */
export function listSolidModels(worldObject: THREE.Object3D): SolidModel[] {
  return Array.from(SolidModelRegistry.collectUnder(worldObject));
}

/**
 * Finds a solid model by root uuid.
 *
 * @param worldObject Scene world group.
 * @param modelId Solid model root uuid.
 * @returns Model or null.
 */
export function findSolidModel(worldObject: THREE.Object3D, modelId: string): SolidModel | null {
  for (const model of listSolidModels(worldObject)) {
    if (model.root.uuid === modelId) return model;
  }
  return null;
}

/**
 * Finds a brush by id across all solid models under the world.
 *
 * @param worldObject Scene world group.
 * @param brushId Brush instance id.
 * @returns Brush lookup or null.
 */
export function findBrush(worldObject: THREE.Object3D, brushId: string): BrushLookup | null {
  for (const model of listSolidModels(worldObject)) {
    const brush = model.findBrush(brushId);
    if (brush) return { model, brush };
  }
  return null;
}

/**
 * Resolves brush meshes for a list of brush ids.
 *
 * @param worldObject Scene world group.
 * @param brushIds Brush ids to resolve.
 * @returns Preview meshes that exist.
 */
export function resolveBrushMeshes(worldObject: THREE.Object3D, brushIds: readonly string[]): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  for (const brushId of brushIds) {
    const found = findBrush(worldObject, brushId);
    if (found?.brush.mesh) meshes.push(found.brush.mesh);
  }
  return meshes;
}

/**
 * Finds a solid CSG group by uuid under any solid model in the world.
 *
 * @param worldObject Scene world group.
 * @param groupId Group uuid.
 * @returns Group lookup or null.
 */
export function findCsgGroup(worldObject: THREE.Object3D, groupId: string): CsgGroupLookup | null {
  for (const model of listSolidModels(worldObject)) {
    const group = findCsgGroupUnder(model.root, groupId);
    if (group) return { model, group };
  }
  return null;
}

/**
 * Depth-first search for a solid CSG group uuid under a solid root.
 *
 * @param root Solid model root or nested group.
 * @param groupId Group uuid.
 * @returns Matching group or null.
 */
export function findCsgGroupUnder(root: THREE.Object3D, groupId: string): THREE.Group | null {
  if (isSolidCsgGroup(root) && root.uuid === groupId && root instanceof THREE.Group) {
    return root;
  }
  for (const child of root.children) {
    const found = findCsgGroupUnder(child, groupId);
    if (found) return found;
  }
  return null;
}

/**
 * Resolves a brush id or solid CSG group uuid to a hierarchy node.
 *
 * @param worldObject Scene world group.
 * @param nodeId Brush id or group uuid.
 * @returns Node lookup or null.
 */
export function resolveSolidHierarchyNode(
  worldObject: THREE.Object3D,
  nodeId: string,
): SolidHierarchyNodeLookup | null {
  const brush = findBrush(worldObject, nodeId);
  if (brush?.brush.mesh) {
    return { model: brush.model, node: brush.brush.mesh, kind: 'brush' };
  }
  const group = findCsgGroup(worldObject, nodeId);
  if (group) return { model: group.model, node: group.group, kind: 'csg_group' };
  return null;
}

/**
 * Resolves many brush/group ids into hierarchy nodes (skips missing ids).
 *
 * @param worldObject Scene world group.
 * @param nodeIds Brush ids and/or group uuids.
 * @returns Resolved nodes in input order.
 */
export function resolveSolidHierarchyNodes(
  worldObject: THREE.Object3D,
  nodeIds: readonly string[],
): SolidHierarchyNodeLookup[] {
  const nodes: SolidHierarchyNodeLookup[] = [];
  for (const nodeId of nodeIds) {
    const found = resolveSolidHierarchyNode(worldObject, nodeId);
    if (found) nodes.push(found);
  }
  return nodes;
}

/**
 * Resolves a solid parent id: solid model root uuid or solid CSG group uuid.
 *
 * @param worldObject Scene world group.
 * @param parentId Model uuid or group uuid.
 * @returns Model and parent object, or null.
 */
export function resolveSolidTreeParent(
  worldObject: THREE.Object3D,
  parentId: string,
): { model: SolidModel; parent: THREE.Object3D } | null {
  const model = findSolidModel(worldObject, parentId);
  if (model) return { model, parent: model.root };
  const group = findCsgGroup(worldObject, parentId);
  if (group) return { model: group.model, parent: group.group };
  return null;
}

/**
 * Returns whether an object is a solid brush preview mesh.
 *
 * @param object Candidate scene object.
 * @returns True for solid brush meshes.
 */
export function isSolidBrushNode(object: THREE.Object3D): boolean {
  return object instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(object);
}
