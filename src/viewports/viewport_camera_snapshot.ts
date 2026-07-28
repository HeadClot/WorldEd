import * as THREE from 'three';
import type { EditorViewport } from './editor_viewport.js';

/** Persisted perspective camera pose for a 3D pane. */
export interface PerspectiveCameraSnapshot {
  kind: 'perspective';
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

/** Persisted orthographic camera pose and zoom for a 2D pane. */
export interface OrthographicCameraSnapshot {
  kind: 'orthographic';
  position: [number, number, number];
  quaternion: [number, number, number, number];
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Camera state stored on a workspace layout leaf. */
export type ViewportCameraSnapshot = PerspectiveCameraSnapshot | OrthographicCameraSnapshot;

/**
 * Captures the live camera of an editor viewport for workspace persistence.
 *
 * @param viewport Live 2D or 3D viewport.
 * @returns Snapshot, or null when the viewport cannot provide a camera.
 */
export function captureViewportCameraSnapshot(viewport: EditorViewport): ViewportCameraSnapshot | null {
  const camera = viewport.getCamera();
  if (camera instanceof THREE.PerspectiveCamera) {
    return capturePerspectiveCamera(camera);
  }
  if (camera instanceof THREE.OrthographicCamera) {
    return captureOrthographicCamera(camera);
  }
  return null;
}

/**
 * Restores a camera snapshot onto a live viewport when kinds match.
 *
 * @param viewport Target viewport.
 * @param snapshot Stored camera state.
 * @returns True when the snapshot was applied.
 */
export function applyViewportCameraSnapshot(viewport: EditorViewport, snapshot: ViewportCameraSnapshot): boolean {
  const camera = viewport.getCamera();
  if (snapshot.kind === 'perspective' && camera instanceof THREE.PerspectiveCamera) {
    applyPerspectiveCamera(camera, snapshot);
    syncFlyingOrientationIfPresent(viewport);
    return true;
  }
  if (snapshot.kind === 'orthographic' && camera instanceof THREE.OrthographicCamera) {
    applyOrthographicCamera(camera, snapshot);
    return true;
  }
  return false;
}

/**
 * Parses an unknown JSON value into a camera snapshot.
 *
 * @param value Unknown storage value.
 * @returns Snapshot or null when invalid.
 */
export function parseViewportCameraSnapshot(value: unknown): ViewportCameraSnapshot | null {
  if (!isRecord(value)) return null;
  const kind = value['kind'];
  if (kind === 'perspective') return parsePerspectiveSnapshot(value);
  if (kind === 'orthographic') return parseOrthographicSnapshot(value);
  return null;
}

/**
 * Syncs flying-camera yaw/pitch when the viewport exposes the helper.
 *
 * @param viewport Target viewport.
 */
function syncFlyingOrientationIfPresent(viewport: EditorViewport): void {
  const candidate = viewport as EditorViewport & { syncFlyingCameraOrientation?: () => void };
  candidate.syncFlyingCameraOrientation?.();
}

/**
 * Captures position and orientation from a perspective camera.
 *
 * @param camera Live perspective camera.
 * @returns Snapshot document.
 */
function capturePerspectiveCamera(camera: THREE.PerspectiveCamera): PerspectiveCameraSnapshot {
  return {
    kind: 'perspective',
    position: vectorToTuple(camera.position),
    quaternion: quaternionToTuple(camera.quaternion),
  };
}

/**
 * Captures pose and frustum from an orthographic camera.
 *
 * @param camera Live orthographic camera.
 * @returns Snapshot document.
 */
function captureOrthographicCamera(camera: THREE.OrthographicCamera): OrthographicCameraSnapshot {
  return {
    kind: 'orthographic',
    position: vectorToTuple(camera.position),
    quaternion: quaternionToTuple(camera.quaternion),
    left: camera.left,
    right: camera.right,
    top: camera.top,
    bottom: camera.bottom,
  };
}

/**
 * Writes a perspective snapshot onto a camera.
 *
 * @param camera Target camera.
 * @param snapshot Stored pose.
 */
function applyPerspectiveCamera(camera: THREE.PerspectiveCamera, snapshot: PerspectiveCameraSnapshot): void {
  camera.position.fromArray(snapshot.position);
  camera.quaternion.fromArray(snapshot.quaternion);
  camera.updateMatrixWorld(true);
}

/**
 * Writes an orthographic snapshot onto a camera.
 *
 * @param camera Target camera.
 * @param snapshot Stored pose and frustum.
 */
function applyOrthographicCamera(camera: THREE.OrthographicCamera, snapshot: OrthographicCameraSnapshot): void {
  camera.position.fromArray(snapshot.position);
  camera.quaternion.fromArray(snapshot.quaternion);
  camera.left = snapshot.left;
  camera.right = snapshot.right;
  camera.top = snapshot.top;
  camera.bottom = snapshot.bottom;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/**
 * Parses a perspective snapshot object.
 *
 * @param value Object candidate.
 * @returns Snapshot or null.
 */
function parsePerspectiveSnapshot(value: Record<string, unknown>): PerspectiveCameraSnapshot | null {
  const position = parseVector3Tuple(value['position']);
  const quaternion = parseQuaternionTuple(value['quaternion']);
  if (!position || !quaternion) return null;
  return { kind: 'perspective', position, quaternion };
}

/**
 * Parses an orthographic snapshot object.
 *
 * @param value Object candidate.
 * @returns Snapshot or null.
 */
function parseOrthographicSnapshot(value: Record<string, unknown>): OrthographicCameraSnapshot | null {
  const position = parseVector3Tuple(value['position']);
  const quaternion = parseQuaternionTuple(value['quaternion']);
  const left = value['left'];
  const right = value['right'];
  const top = value['top'];
  const bottom = value['bottom'];
  if (!position || !quaternion) return null;
  if (!isFiniteNumber(left) || !isFiniteNumber(right) || !isFiniteNumber(top) || !isFiniteNumber(bottom)) {
    return null;
  }
  return { kind: 'orthographic', position, quaternion, left, right, top, bottom };
}

/**
 * Converts a Vector3 to a JSON tuple.
 *
 * @param vector Source vector.
 * @returns Three-number tuple.
 */
function vectorToTuple(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

/**
 * Converts a Quaternion to a JSON tuple.
 *
 * @param quaternion Source quaternion.
 * @returns Four-number tuple.
 */
function quaternionToTuple(quaternion: THREE.Quaternion): [number, number, number, number] {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

/**
 * Parses a three-number position tuple.
 *
 * @param value Unknown value.
 * @returns Tuple or null.
 */
function parseVector3Tuple(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const x = value[0];
  const y = value[1];
  const z = value[2];
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return null;
  return [x, y, z];
}

/**
 * Parses a four-number quaternion tuple.
 *
 * @param value Unknown value.
 * @returns Tuple or null.
 */
function parseQuaternionTuple(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const x = value[0];
  const y = value[1];
  const z = value[2];
  const w = value[3];
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z) || !isFiniteNumber(w)) return null;
  return [x, y, z, w];
}

/**
 * Type guard for finite numbers.
 *
 * @param value Unknown value.
 * @returns True for finite numbers.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Type guard for plain objects.
 *
 * @param value Unknown value.
 * @returns True for non-null objects.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
