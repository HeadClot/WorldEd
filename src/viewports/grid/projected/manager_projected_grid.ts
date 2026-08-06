import type { EditorPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';
import {
  readSharedProjectedGridVisible,
  resetSharedProjectedGridUniforms,
  writeSharedProjectedGridCellSize,
  writeSharedProjectedGridPlaneFrame,
  writeSharedProjectedGridVisible,
} from '@/materials/shader/uniform/uniform_projected_grid_shared.js';

/**
 * Shared projected-grid state for multi-view panes. Lattice drawing lives in
 * content material shaders via {@link ShaderChunkProjectedGrid}; this manager
 * only updates the shared uniforms used by every such material.
 */
export class ManagerProjectedGrid {
  /**
   * Updates the oriented lattice frame for all content materials.
   *
   * @param frame Grid plane frame.
   */
  static setPlaneFrame(frame: EditorPlaneFrame): void {
    writeSharedProjectedGridPlaneFrame(frame);
  }

  /**
   * Updates the minor cell size for all content materials.
   *
   * @param cellSize World units per minor cell.
   */
  static setCellSize(cellSize: number): void {
    writeSharedProjectedGridCellSize(cellSize);
  }

  /**
   * Shows or hides the projected grid for the active multi-view prepare pass.
   *
   * @param visible Whether the lattice should draw.
   */
  static setVisibleForRenderPass(visible: boolean): void {
    writeSharedProjectedGridVisible(visible);
  }

  /**
   * Returns whether the shared projected grid is currently enabled.
   *
   * @returns True when drawing.
   */
  static isVisible(): boolean {
    return readSharedProjectedGridVisible();
  }

  /** Resets shared uniform state for tests and full editor dispose. */
  static dispose(): void {
    resetSharedProjectedGridUniforms();
  }
}
