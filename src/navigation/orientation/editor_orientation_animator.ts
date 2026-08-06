import * as THREE from 'three';
import { easeOutCubic } from '@/utils/easing.js';
import { CameraAnimationConfig } from '@/navigation/camera/camera_animation_config.js';
import type { EditorOrientation } from './editor_orientation.js';
import type { EditorPlaneFrame } from './editor_orientation_basis.js';
import {
  buildDefaultPlaneFrame,
  buildOrientationFromUp,
  buildPlaneFrameFromNormal,
  EDITOR_DEFAULT_UP,
} from './editor_orientation_basis.js';

/** Per-camera start pose captured when a reorientation animation begins. */
export interface EditorOrientationCameraStart {
  camera: THREE.PerspectiveCamera;
  startPosition: THREE.Vector3;
  startLookAt: THREE.Vector3;
  startUp: THREE.Vector3;
}

/**
 * Smoothly reorients perspective cameras in place while updating the shared
 * editor orientation quaternion and plane frame. Camera world position and the
 * world look-at point stay fixed; only camera up rolls with the working frame.
 */
export class EditorOrientationAnimator {
  private editorOrientation: EditorOrientation;
  private startQuaternion: THREE.Quaternion;
  private targetQuaternion: THREE.Quaternion;
  private startFrame: EditorPlaneFrame;
  private targetFrame: EditorPlaneFrame;
  private cameraStarts: EditorOrientationCameraStart[];
  private startTime: number;
  private duration: number;
  private animationActive: boolean;
  private onComplete: (() => void) | null;
  private readonly scratchUp: THREE.Vector3;
  private readonly scratchQuaternion: THREE.Quaternion;
  private readonly scratchDelta: THREE.Quaternion;
  private readonly scratchInverseStart: THREE.Quaternion;

  /**
   * Creates an idle animator bound to a shared orientation store.
   *
   * @param editorOrientation Shared working orientation.
   */
  constructor(editorOrientation: EditorOrientation) {
    this.editorOrientation = editorOrientation;
    this.startQuaternion = new THREE.Quaternion();
    this.targetQuaternion = new THREE.Quaternion();
    this.startFrame = buildDefaultPlaneFrame();
    this.targetFrame = buildDefaultPlaneFrame();
    this.cameraStarts = [];
    this.startTime = 0;
    this.duration = 300;
    this.animationActive = false;
    this.onComplete = null;
    this.scratchUp = new THREE.Vector3();
    this.scratchQuaternion = new THREE.Quaternion();
    this.scratchDelta = new THREE.Quaternion();
    this.scratchInverseStart = new THREE.Quaternion();
  }

  /**
   * Starts an animation that aligns editor up to a face normal.
   *
   * @param faceNormal Target editor up.
   * @param planeOrigin Point on the face used as the visual grid plane origin.
   * @param cameras Perspective cameras to reorient in place.
   * @param config Animation timing config.
   * @param onComplete Optional completion callback.
   * @returns True when a timed animation is running.
   */
  animateAlignToFace(
    faceNormal: THREE.Vector3,
    planeOrigin: THREE.Vector3,
    cameras: readonly THREE.PerspectiveCamera[],
    config: CameraAnimationConfig,
    onComplete?: () => void,
  ): boolean {
    const frame = buildPlaneFrameFromNormal(faceNormal, planeOrigin);
    const targetQuaternion = buildOrientationFromUp(frame.normal);
    return this.beginAnimation(targetQuaternion, frame, cameras, config, onComplete);
  }

  /**
   * Starts an animation that restores default orientation.
   *
   * @param cameras Perspective cameras to reorient in place.
   * @param config Animation timing config.
   * @param onComplete Optional completion callback.
   * @returns True when a timed animation is running.
   */
  animateResetToDefault(
    cameras: readonly THREE.PerspectiveCamera[],
    config: CameraAnimationConfig,
    onComplete?: () => void,
  ): boolean {
    const frame = buildDefaultPlaneFrame();
    const targetQuaternion = new THREE.Quaternion();
    return this.beginAnimation(targetQuaternion, frame, cameras, config, onComplete);
  }

  /**
   * Advances the animation by one frame.
   *
   * @returns True while the animation is still running.
   */
  update(): boolean {
    if (!this.animationActive) {
      return false;
    }
    const rawT = this.computeRawProgress();
    const easedT = easeOutCubic(rawT);
    this.applyInterpolatedState(easedT);
    if (rawT >= 1) {
      this.finishAnimation();
    }
    return this.animationActive;
  }

  /**
   * Returns whether a reorientation animation is active.
   *
   * @returns True while animating.
   */
  isAnimating(): boolean {
    return this.animationActive;
  }

  /** Cancels the animation and snaps to the current eased state. */
  cancel(): void {
    if (!this.animationActive) {
      return;
    }
    const rawT = this.computeRawProgress();
    this.applyInterpolatedState(easeOutCubic(rawT));
    this.finishAnimation();
  }

  /**
   * Captures start poses and begins interpolating toward the target frame.
   *
   * @param targetQuaternion Target orientation.
   * @param targetFrame Target plane frame.
   * @param cameras Cameras to animate.
   * @param config Timing config.
   * @param onComplete Optional completion callback.
   * @returns True when a timed animation is running.
   */
  private beginAnimation(
    targetQuaternion: THREE.Quaternion,
    targetFrame: EditorPlaneFrame,
    cameras: readonly THREE.PerspectiveCamera[],
    config: CameraAnimationConfig,
    onComplete?: () => void,
  ): boolean {
    this.captureStartState(targetQuaternion, targetFrame, cameras, config, onComplete);
    if (!config.isAnimationEnabled() || this.duration <= 0) {
      this.applyInterpolatedState(1);
      this.finishAnimation();
      return false;
    }
    this.animationActive = true;
    return true;
  }

  /**
   * Stores start/target state for the current animation.
   *
   * @param targetQuaternion Target orientation.
   * @param targetFrame Target plane frame.
   * @param cameras Cameras to animate.
   * @param config Timing config.
   * @param onComplete Optional completion callback.
   */
  private captureStartState(
    targetQuaternion: THREE.Quaternion,
    targetFrame: EditorPlaneFrame,
    cameras: readonly THREE.PerspectiveCamera[],
    config: CameraAnimationConfig,
    onComplete?: () => void,
  ): void {
    this.editorOrientation.copyQuaternionTo(this.startQuaternion);
    this.startFrame = this.editorOrientation.getPlaneFrame();
    this.targetQuaternion.copy(targetQuaternion).normalize();
    this.targetFrame = {
      origin: targetFrame.origin.clone(),
      uAxis: targetFrame.uAxis.clone(),
      vAxis: targetFrame.vAxis.clone(),
      normal: targetFrame.normal.clone(),
    };
    this.cameraStarts = cameras.map((camera) => this.captureCameraStart(camera));
    this.startTime = performance.now();
    this.duration = config.getDurationMs();
    this.onComplete = onComplete ?? null;
  }

  /**
   * Captures one camera's start pose.
   *
   * @param camera Perspective camera.
   * @returns Start pose snapshot.
   */
  private captureCameraStart(camera: THREE.PerspectiveCamera): EditorOrientationCameraStart {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    return {
      camera,
      startPosition: camera.position.clone(),
      startLookAt: camera.position.clone().add(forward),
      startUp: camera.up.clone(),
    };
  }

  /**
   * Computes normalized raw progress 0..1 from wall-clock time.
   *
   * @returns Progress before easing.
   */
  private computeRawProgress(): number {
    if (this.duration <= 0) {
      return 1;
    }
    const elapsed = performance.now() - this.startTime;
    return Math.min(elapsed / this.duration, 1);
  }

  /**
   * Applies slerped orientation and reoriented cameras at progress t.
   *
   * @param t Eased progress 0..1.
   */
  private applyInterpolatedState(t: number): void {
    this.scratchQuaternion.slerpQuaternions(this.startQuaternion, this.targetQuaternion, t);
    const frame = this.lerpPlaneFrame(t);
    this.editorOrientation.setOrientationAndFrame(this.scratchQuaternion, frame);
    this.cameraStarts.forEach((start) => {
      this.applyCameraAtProgress(start, t);
    });
  }

  /**
   * Interpolates plane frame origin and basis between start and target.
   *
   * @param t Eased progress 0..1.
   * @returns Interpolated frame.
   */
  private lerpPlaneFrame(t: number): EditorPlaneFrame {
    const origin = this.startFrame.origin.clone().lerp(this.targetFrame.origin, t);
    const normal = this.startFrame.normal.clone().lerp(this.targetFrame.normal, t).normalize();
    if (normal.lengthSq() < 1e-12) {
      normal.copy(EDITOR_DEFAULT_UP);
    }
    return buildPlaneFrameFromNormal(normal, origin);
  }

  /**
   * Reorients one camera in place at progress t. World position and look-at
   * point stay fixed; only up rolls with the orientation delta.
   *
   * @param start Captured start pose.
   * @param t Eased progress 0..1.
   */
  private applyCameraAtProgress(start: EditorOrientationCameraStart, t: number): void {
    this.scratchQuaternion.slerpQuaternions(this.startQuaternion, this.targetQuaternion, t);
    this.scratchInverseStart.copy(this.startQuaternion).invert();
    this.scratchDelta.copy(this.scratchQuaternion).multiply(this.scratchInverseStart);
    this.scratchUp.copy(start.startUp).applyQuaternion(this.scratchDelta).normalize();
    start.camera.position.copy(start.startPosition);
    start.camera.up.copy(this.scratchUp);
    start.camera.lookAt(start.startLookAt);
  }

  /** Completes the animation and invokes the completion callback. */
  private finishAnimation(): void {
    this.animationActive = false;
    const callback = this.onComplete;
    this.onComplete = null;
    callback?.();
  }
}
