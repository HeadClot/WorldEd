import * as THREE from 'three';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { isPerspectiveViewport } from '@/viewports/core/viewport_editor.js';
import { kindPrefersWorldHost } from '@/viewports/core/viewport_editor.js';

/**
 * Owns placement of the authoritative world group. Exactly one scene may parent
 * the world object; other viewports receive clones from the sync manager.
 */
export class ViewportWorldHost {
  private readonly holderScene: THREE.Scene;
  private worldObject: THREE.Group | null;
  private hostViewport: ViewportEditor | null;

  /** Creates a host with a non-rendered holder scene for parking the world. */
  constructor() {
    this.holderScene = new THREE.Scene();
    this.holderScene.name = 'viewport_world_holder';
    this.worldObject = null;
    this.hostViewport = null;
  }

  /**
   * Registers the authoritative world group and parks it on the holder.
   *
   * @param worldObject Shared hierarchy root.
   */
  setWorldObject(worldObject: THREE.Group): void {
    this.detachWorldFromCurrentParent();
    this.worldObject = worldObject;
    this.holderScene.add(worldObject);
    this.hostViewport = null;
  }

  /**
   * Returns the authoritative world group when set.
   *
   * @returns World group or null.
   */
  getWorldObject(): THREE.Group | null {
    return this.worldObject;
  }

  /**
   * Returns the viewport currently hosting the world object, if any.
   *
   * @returns Host viewport or null when parked on the holder.
   */
  getHostViewport(): ViewportEditor | null {
    return this.hostViewport;
  }

  /**
   * Chooses a host from active viewports (prefer perspective) and reparents.
   *
   * @param viewports Candidate live viewports.
   */
  reassignHost(viewports: readonly ViewportEditor[]): void {
    if (!this.worldObject) return;
    const preferred = viewports.find((viewport) => kindPrefersWorldHost(viewport.getViewportKind()));
    const nextHost = preferred ?? viewports.find((viewport) => isPerspectiveViewport(viewport)) ?? null;
    this.setHost(nextHost);
  }

  /**
   * Parents the world object under the given viewport scene, or the holder.
   *
   * @param host Viewport that should own the world, or null for the holder.
   */
  setHost(host: ViewportEditor | null): void {
    if (!this.worldObject) {
      this.hostViewport = host;
      return;
    }
    this.detachWorldFromCurrentParent();
    if (!host) {
      this.holderScene.add(this.worldObject);
      this.hostViewport = null;
      return;
    }
    host.getScene().add(this.worldObject);
    this.hostViewport = host;
  }

  /**
   * Returns whether a viewport is the current world host.
   *
   * @param viewport Viewport to test.
   * @returns True when this viewport parents the world object.
   */
  isHost(viewport: ViewportEditor): boolean {
    return this.hostViewport === viewport;
  }

  /**
   * Returns viewports that should receive world clones (all non-hosts).
   *
   * @param viewports All live viewports.
   * @returns Non-host viewports.
   */
  getCloneTargetViewports(viewports: readonly ViewportEditor[]): ViewportEditor[] {
    return viewports.filter((viewport) => !this.isHost(viewport));
  }

  /** Detaches the world object from whichever scene currently parents it. */
  private detachWorldFromCurrentParent(): void {
    if (!this.worldObject?.parent) return;
    this.worldObject.parent.remove(this.worldObject);
  }
}
