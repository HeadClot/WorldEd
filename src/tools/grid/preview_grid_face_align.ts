import * as THREE from 'three';
import { FaceSelectionHighlight } from '@/selection/face/face_selection_highlight.js';
import type { FacePickResult } from '@/selection/face/raycaster_face_selection.js';

/**
 * Orange face hover preview while grid align-to-face pick is armed. Uses the
 * same dual-pass face highlight path as face selection mode.
 */
export class PreviewGridFaceAlign {
  private readonly highlight: FaceSelectionHighlight;
  private lastRegionKey: string;

  /**
   * Creates a hover preview bound to a rendered scene.
   *
   * @param scene Scene that receives the highlight group.
   */
  constructor(scene: THREE.Scene) {
    this.highlight = new FaceSelectionHighlight(scene);
    this.lastRegionKey = '';
  }

  /**
   * Shows hover fill for a picked face, or clears when null.
   *
   * @param pick Face under the pointer, or null to clear.
   */
  setHoverPick(pick: FacePickResult | null): void {
    if (!pick) {
      this.clearHover();
      return;
    }
    const regionKey = `${pick.mesh.uuid}:${pick.faceIndex}`;
    if (regionKey === this.lastRegionKey) {
      return;
    }
    this.lastRegionKey = regionKey;
    this.highlight.setSelectedFaces([{ mesh: pick.mesh, faceIndex: pick.faceIndex }]);
    this.highlight.flushPendingHighlights();
  }

  /** Clears the hover preview. */
  clearHover(): void {
    if (this.lastRegionKey.length === 0) {
      return;
    }
    this.lastRegionKey = '';
    this.highlight.setSelectedFaces([]);
    this.highlight.flushPendingHighlights();
  }

  /** Disposes highlight resources. */
  dispose(): void {
    this.clearHover();
    this.highlight.dispose();
  }
}
