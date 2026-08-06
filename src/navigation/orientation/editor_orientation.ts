import * as THREE from 'three';
import {
  buildDefaultPlaneFrame,
  buildOrientationFromUp,
  buildPlaneFrameFromNormal,
  EDITOR_DEFAULT_FORWARD,
  EDITOR_DEFAULT_RIGHT,
  EDITOR_DEFAULT_UP,
  type EditorPlaneFrame,
} from './editor_orientation_basis.js';
import { worldBasisFromQuaternion, type EditorOrientationWorldBasis } from './editor_orientation_edge_align.js';

/** Listener notified when the working orientation changes. */
export type EditorOrientationListener = () => void;

/**
 * Shared editor working orientation. Maps the default Y-up editor frame into
 * world space without mutating scene content transforms.
 */
export class EditorOrientation {
  private readonly quaternion: THREE.Quaternion;
  private readonly planeFrame: EditorPlaneFrame;
  private readonly listeners: Set<EditorOrientationListener>;
  private readonly scratchUp: THREE.Vector3;
  private readonly scratchRight: THREE.Vector3;
  private readonly scratchForward: THREE.Vector3;

  /** Creates an identity (world Y-up) orientation. */
  constructor() {
    this.quaternion = new THREE.Quaternion();
    this.planeFrame = buildDefaultPlaneFrame();
    this.listeners = new Set();
    this.scratchUp = new THREE.Vector3();
    this.scratchRight = new THREE.Vector3();
    this.scratchForward = new THREE.Vector3();
  }

  /**
   * Returns a copy of the orientation quaternion.
   *
   * @returns Local-editor-to-world quaternion.
   */
  getQuaternion(): THREE.Quaternion {
    return this.quaternion.clone();
  }

  /**
   * Copies the orientation quaternion into the target.
   *
   * @param target Quaternion to fill.
   * @returns The target quaternion.
   */
  copyQuaternionTo(target: THREE.Quaternion): THREE.Quaternion {
    return target.copy(this.quaternion);
  }

  /**
   * Returns the current editor up direction in world space.
   *
   * @returns Unit up vector.
   */
  getUp(): THREE.Vector3 {
    return this.scratchUp.copy(EDITOR_DEFAULT_UP).applyQuaternion(this.quaternion).normalize();
  }

  /**
   * Returns the current editor right direction in world space.
   *
   * @returns Unit right vector.
   */
  getRight(): THREE.Vector3 {
    return this.scratchRight.copy(EDITOR_DEFAULT_RIGHT).applyQuaternion(this.quaternion).normalize();
  }

  /**
   * Returns the current editor forward direction in world space.
   *
   * @returns Unit forward vector.
   */
  getForward(): THREE.Vector3 {
    return this.scratchForward.copy(EDITOR_DEFAULT_FORWARD).applyQuaternion(this.quaternion).normalize();
  }

  /**
   * Returns the current working-frame +Z axis in world space.
   *
   * @returns Unit Z axis (blue triad axis).
   */
  getZAxis(): THREE.Vector3 {
    return this.scratchForward.set(0, 0, 1).applyQuaternion(this.quaternion).normalize();
  }

  /**
   * Returns a copy of the working-frame world basis.
   *
   * @returns World X, Y, and Z axes.
   */
  getWorldBasis(): EditorOrientationWorldBasis {
    return worldBasisFromQuaternion(this.quaternion);
  }

  /**
   * Returns a copy of the visual grid plane frame.
   *
   * @returns Plane origin, U/V axes, and normal.
   */
  getPlaneFrame(): EditorPlaneFrame {
    return {
      origin: this.planeFrame.origin.clone(),
      uAxis: this.planeFrame.uAxis.clone(),
      vAxis: this.planeFrame.vAxis.clone(),
      normal: this.planeFrame.normal.clone(),
    };
  }

  /**
   * Copies the plane frame into mutable targets without allocating.
   *
   * @param origin Target origin.
   * @param uAxis Target U axis.
   * @param vAxis Target V axis.
   * @param normal Target normal.
   */
  copyPlaneFrameTo(origin: THREE.Vector3, uAxis: THREE.Vector3, vAxis: THREE.Vector3, normal: THREE.Vector3): void {
    origin.copy(this.planeFrame.origin);
    uAxis.copy(this.planeFrame.uAxis);
    vAxis.copy(this.planeFrame.vAxis);
    normal.copy(this.planeFrame.normal);
  }

  /**
   * Returns whether the orientation is identity (default Y-up).
   *
   * @returns True when quaternion is identity within epsilon.
   */
  isDefault(): boolean {
    return (
      Math.abs(this.quaternion.x) < 1e-8 &&
      Math.abs(this.quaternion.y) < 1e-8 &&
      Math.abs(this.quaternion.z) < 1e-8 &&
      Math.abs(this.quaternion.w - 1) < 1e-8
    );
  }

  /**
   * Returns whether this orientation matches another within a small epsilon
   * (treats q and -q as the same rotation).
   *
   * @param other Orientation to compare.
   * @param epsilon Absolute component tolerance.
   * @returns True when both represent the same rotation.
   */
  matchesOrientation(other: EditorOrientation, epsilon: number = 1e-5): boolean {
    const a = this.quaternion;
    const b = other.quaternion;
    const sameSign =
      Math.abs(a.x - b.x) <= epsilon &&
      Math.abs(a.y - b.y) <= epsilon &&
      Math.abs(a.z - b.z) <= epsilon &&
      Math.abs(a.w - b.w) <= epsilon;
    if (sameSign) {
      return true;
    }
    return (
      Math.abs(a.x + b.x) <= epsilon &&
      Math.abs(a.y + b.y) <= epsilon &&
      Math.abs(a.z + b.z) <= epsilon &&
      Math.abs(a.w + b.w) <= epsilon
    );
  }

  /** Resets orientation and plane frame to world defaults. */
  resetToDefault(): void {
    this.quaternion.identity();
    this.replacePlaneFrame(buildDefaultPlaneFrame());
    this.notifyListeners();
  }

  /**
   * Sets orientation so the face normal becomes editor up.
   *
   * @param faceNormal Outward face normal in world space.
   * @param pivotPoint Point on the face used as plane origin.
   */
  setFromFaceNormal(faceNormal: THREE.Vector3, pivotPoint: THREE.Vector3): void {
    const frame = buildPlaneFrameFromNormal(faceNormal, pivotPoint);
    this.quaternion.copy(buildOrientationFromUp(frame.normal));
    this.replacePlaneFrame(frame);
    this.notifyListeners();
  }

  /**
   * Applies a precomputed orientation and plane frame.
   *
   * @param quaternion Local-editor-to-world quaternion.
   * @param frame Visual grid plane frame.
   */
  setOrientationAndFrame(quaternion: THREE.Quaternion, frame: EditorPlaneFrame): void {
    this.quaternion.copy(quaternion).normalize();
    this.replacePlaneFrame(frame);
    this.notifyListeners();
  }

  /**
   * Moves only the lattice origin. Axes and quaternion stay unchanged.
   *
   * @param worldOrigin New plane / snap lattice origin in world space.
   */
  setPlaneOrigin(worldOrigin: THREE.Vector3): void {
    this.planeFrame.origin.copy(worldOrigin);
    this.notifyListeners();
  }

  /**
   * Registers a change listener.
   *
   * @param listener Callback invoked after orientation changes.
   * @returns Unsubscribe function.
   */
  subscribe(listener: EditorOrientationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Replaces the stored plane frame vectors in place.
   *
   * @param frame Source frame.
   */
  private replacePlaneFrame(frame: EditorPlaneFrame): void {
    this.planeFrame.origin.copy(frame.origin);
    this.planeFrame.uAxis.copy(frame.uAxis);
    this.planeFrame.vAxis.copy(frame.vAxis);
    this.planeFrame.normal.copy(frame.normal);
  }

  /** Notifies all registered listeners. */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}
