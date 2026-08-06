import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { readPersistentMeshDocument, writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { captureMeshDocumentFaceTexturesFromDisplay } from '@/mesh/convert/mesh_document_face_texture_sync.js';
import { meshDocumentFromBufferGeometryWelded } from './mesh_edit_weld.js';

/** UserData key storing a session MeshDocument on a content mesh. */
export const MESH_EDIT_DOCUMENT_USERDATA_KEY = 'meshEditDocument';

/**
 * Returns a MeshDocument bound to a content mesh for Edit Mode. Prefers an
 * existing session document, then a persistent authored/import document (n-gon
 * safe), otherwise welds a document from current BufferGeometry.
 *
 * @param mesh Content mesh.
 * @returns Bound mesh document, or null when geometry is unusable.
 */
export function ensureMeshEditDocument(mesh: THREE.Mesh): MeshDocument | null {
  const sessionDocument = readBoundMeshEditDocument(mesh);
  if (sessionDocument) {
    captureMeshDocumentFaceTexturesFromDisplay(mesh, sessionDocument);
    return sessionDocument;
  }
  const persistent = readPersistentMeshDocument(mesh);
  if (persistent) {
    const sessionClone = persistent.clone();
    captureMeshDocumentFaceTexturesFromDisplay(mesh, sessionClone);
    mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] = sessionClone;
    return sessionClone;
  }
  return bindWeldedDocumentFromGeometry(mesh);
}

/**
 * Reads a previously bound session MeshDocument from mesh userData.
 *
 * @param mesh Content mesh.
 * @returns Document or null.
 */
export function readBoundMeshEditDocument(mesh: THREE.Mesh): MeshDocument | null {
  const value = mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY];
  if (value instanceof MeshDocument) {
    return value;
  }
  return null;
}

/**
 * Clears a session MeshDocument binding from a mesh. Writes the session result
 * back as the persistent document so n-gon topology (including coplanar merges
 * recovered from GPU triangles) survives leaving Edit Mode and later re-entry.
 *
 * @param mesh Content mesh.
 */
export function clearMeshEditDocumentBinding(mesh: THREE.Mesh): void {
  const sessionDocument = readBoundMeshEditDocument(mesh);
  if (sessionDocument) {
    writePersistentMeshDocument(mesh, sessionDocument.clone());
  }
  delete mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY];
}

/**
 * Welds a MeshDocument from mesh geometry and stores it as the session binding.
 *
 * @param mesh Content mesh.
 * @returns Document, or null when empty.
 */
function bindWeldedDocumentFromGeometry(mesh: THREE.Mesh): MeshDocument | null {
  const geometry = mesh.geometry;
  if (!(geometry instanceof THREE.BufferGeometry)) {
    return null;
  }
  const document = meshDocumentFromBufferGeometryWelded(geometry, undefined, mesh);
  if (document.getTopology().getVertexCount() === 0) {
    return null;
  }
  mesh.userData[MESH_EDIT_DOCUMENT_USERDATA_KEY] = document;
  writePersistentMeshDocument(mesh, document.clone());
  return document;
}
