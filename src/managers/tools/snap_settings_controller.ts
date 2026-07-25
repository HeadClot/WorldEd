import * as THREE from 'three';
import { GridSnap } from '../../transform/snap/grid_snap.js';
import { SnapManager } from '../../transform/snap/snap_manager.js';
import { updateGridDivisions } from '../../viewports/grid/grid_updater.js';
import { Viewport3D } from '../../viewports/viewport_3d.js';
import { Viewport2D } from '../../viewports/viewport_2d.js';
import { Toolbar } from '../../ui/toolbar.js';
import { StatusBar } from '../../ui/status_bar.js';
import { KeyboardShortcutHandler } from '../input/keyboard_shortcut_handler.js';
import { TextureLockSettings } from '../../texture/lock/texture_lock_settings.js';
import { SolidModel } from '../../solid/model/solid_model.js';

/** Dependencies for snap interval, snap toggle, and texture lock controls. */
export interface SnapSettingsControllerDependencies {
  gridSnap: GridSnap;
  snapManager: SnapManager;
  textureLock: TextureLockSettings;
  toolbar: Toolbar;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: KeyboardShortcutHandler;
  worldObject: THREE.Group;
  viewport2DTop: Viewport2D;
  viewport2DFront: Viewport2D;
  viewport2DSide: Viewport2D;
  viewport3D: Viewport3D;
  getUserSnapEnabled: () => boolean;
  setUserSnapEnabled: (enabled: boolean) => void;
  /** Optional hook when the snap interval changes (CAD ruler ticks, etc.). */
  onSnapIntervalChanged?: (interval: number) => void;
}

/** Owns snap interval changes, snap toggle, texture lock, and grid refresh. */
export class SnapSettingsController {
  private deps: SnapSettingsControllerDependencies;

  /**
   * Creates a snap settings controller.
   *
   * @param deps Shared editor systems used by snap controls.
   */
  constructor(deps: SnapSettingsControllerDependencies) {
    this.deps = deps;
  }

  /** Wires SnapManager change notifications and keyboard interval shortcuts. */
  setup(): void {
    this.deps.snapManager.onIntervalChanged((interval) => {
      this.onSnapIntervalChanged(interval);
    });
    this.bindSnapKeyboardShortcuts();
    this.onSnapIntervalChanged(this.deps.snapManager.getInterval());
  }

  /** Toggles user snap preference and refreshes toolbar/status UI. */
  onToggleSnap(): void {
    const next = !this.deps.getUserSnapEnabled();
    this.deps.setUserSnapEnabled(next);
    this.deps.gridSnap.setEnabled(next);
    const snapButtonIndex = this.deps.toolbar.getButtonIndexByLabel('Snap');
    this.deps.toolbar.setButtonActive(snapButtonIndex, next);
    this.deps.statusBar?.setSnapStatus(next);
  }

  /**
   * Toggles position lock: UVs stick when moving/rotating objects and brushes.
   * Off = world-slide. Toggle never rewrites UVs by itself.
   */
  onTogglePositionLock(): void {
    const locked = this.deps.textureLock.togglePositionLock();
    this.deps.toolbar.setButtonActiveByLabel('Pos Lock', locked);
    this.syncSolidUvStickHints();
    if (this.deps.statusBar) {
      this.deps.statusBar.setLastAction(
        locked ? 'Position lock on (UVs stick on move/rotate)' : 'Position lock off (world slide)',
      );
    }
  }

  /**
   * Toggles stretch lock: UVs stretch when scaling objects and brushes. Off =
   * world tile density. Toggle never rewrites UVs by itself.
   */
  onToggleStretchLock(): void {
    const locked = this.deps.textureLock.toggleStretchLock();
    this.deps.toolbar.setButtonActiveByLabel('Stretch Lock', locked);
    this.syncSolidUvStickHints();
    if (this.deps.statusBar) {
      this.deps.statusBar.setLastAction(
        locked ? 'Stretch lock on (UVs stretch on scale)' : 'Stretch lock off (tile density)',
      );
    }
  }

  /** Legacy combined toggle kept for callers that still use a single control. */
  onToggleTextureLock(): void {
    const locked = this.deps.textureLock.toggle();
    this.deps.toolbar.setButtonActiveByLabel('Pos Lock', this.deps.textureLock.isPositionLocked());
    this.deps.toolbar.setButtonActiveByLabel('Stretch Lock', this.deps.textureLock.isStretchLocked());
    this.syncSolidUvStickHints();
    if (this.deps.statusBar) {
      this.deps.statusBar.setLastAction(locked ? 'Texture locks on' : 'Texture locks off (world slide / density)');
    }
  }

  /** Updates solid models with a legacy stick hint from either lock. No remesh. */
  private syncSolidUvStickHints(): void {
    const flags = this.deps.textureLock.getFlags();
    const stick = flags.positionLock || flags.stretchLock;
    this.deps.worldObject.traverse((child) => {
      const model = SolidModel.fromObject(child);
      if (!model) return;
      model.setUvStickToBrush(stick);
    });
  }

  /** Cycles the snap interval to the next preset value. */
  onSnapIntervalForward(): void {
    this.deps.snapManager.cycleForward();
  }

  /** Cycles the snap interval to the previous preset value. */
  onSnapIntervalBackward(): void {
    this.deps.snapManager.cycleBackward();
  }

  /**
   * After undo/redo: rebake content-mesh UVs only when a world-space component
   * is unlocked (position and/or stretch). Solid brushes are ignored.
   */
  rebakeWorldTexturesIfLocked(): void {
    const meshes: THREE.Mesh[] = [];
    this.deps.worldObject.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        meshes.push(child);
      }
    });
    this.deps.textureLock.rebakeMeshesIfLocked(meshes);
  }

  /**
   * Handles snap interval change events by updating all dependent systems.
   *
   * @param interval The new snap interval value.
   */
  private onSnapIntervalChanged(interval: number): void {
    this.deps.gridSnap.setInterval(interval);
    this.deps.statusBar?.setSnapInterval(interval);
    this.updateAllViewportGrids(interval);
    this.deps.onSnapIntervalChanged?.(interval);
  }

  /**
   * Updates the grid division count in all four viewports.
   *
   * @param interval The new snap interval value.
   */
  private updateAllViewportGrids(interval: number): void {
    updateGridDivisions(this.deps.viewport2DTop.getGrid(), interval);
    updateGridDivisions(this.deps.viewport2DFront.getGrid(), interval);
    updateGridDivisions(this.deps.viewport2DSide.getGrid(), interval);
    updateGridDivisions(this.deps.viewport3D.getGrid(), interval);
  }

  /** Binds keyboard shortcuts for snap interval cycling. */
  private bindSnapKeyboardShortcuts(): void {
    this.deps.keyboardShortcutHandler.setOnSnapIntervalForward(() => this.onSnapIntervalForward());
    this.deps.keyboardShortcutHandler.setOnSnapIntervalBackward(() => this.onSnapIntervalBackward());
  }
}
