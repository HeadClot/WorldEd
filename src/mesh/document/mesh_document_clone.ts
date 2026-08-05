import type { MeshDocument } from './mesh_document.js';

/**
 * Returns a deep clone of a mesh document.
 *
 * @param document Source document.
 * @returns Independent copy.
 */
export function cloneMeshDocument(document: MeshDocument): MeshDocument {
  return document.clone();
}
