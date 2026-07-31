import { UndoCommand } from '@/commands/command_undo.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { FaceTextureMapping, cloneFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';

/** One solid face texture paint target. */
export interface SolidFaceTextureTarget {
  model: SolidModel;
  brushId: string;
  surfaceIndex: number;
}

/** Snapshot of one face texture mapping for undo. */
interface FaceTextureSnapshot {
  model: SolidModel;
  brushId: string;
  surfaceIndex: number;
  previousMapping: FaceTextureMapping;
}

/**
 * Undoable per-face solid texture assignment on brush surfaces.
 * Presentation-only: remeshes painted brushes, never force-rebuilds CSG.
 */
export class CommandTextureSolidFaceAssign implements UndoCommand {
  private readonly targets: SolidFaceTextureTarget[];
  private readonly textureId: string;
  private snapshots: FaceTextureSnapshot[];
  private executed: boolean;

  /**
   * Creates a solid face texture command.
   *
   * @param targets Unique brush faces to paint.
   * @param textureId Texture identity.
   */
  constructor(targets: SolidFaceTextureTarget[], textureId: string) {
    this.targets = targets.slice();
    this.textureId = textureId;
    this.snapshots = [];
    this.executed = false;
  }

  /** Applies per-face textures and remeshes each affected brush. */
  execute(): void {
    if (this.executed) return;
    this.snapshots = [];
    const brushesByModel = new Map<SolidModel, Set<string>>();
    for (const target of this.targets) {
      if (!this.applyToTarget(target)) continue;
      this.addBrush(brushesByModel, target.model, target.brushId);
    }
    this.refreshPresentations(brushesByModel);
    this.executed = true;
  }

  /** Restores prior face mappings and remeshes. */
  undo(): void {
    if (!this.executed) return;
    const brushesByModel = new Map<SolidModel, Set<string>>();
    for (const snapshot of this.snapshots) {
      if (!this.restoreSnapshot(snapshot)) continue;
      this.addBrush(brushesByModel, snapshot.model, snapshot.brushId);
    }
    this.refreshPresentations(brushesByModel);
    this.snapshots = [];
    this.executed = false;
  }

  /**
   * Snapshots and paints one face target.
   *
   * @param target Brush face to paint.
   * @returns True when the brush was found.
   */
  private applyToTarget(target: SolidFaceTextureTarget): boolean {
    const brush = target.model.findBrush(target.brushId);
    if (!brush) return false;
    this.snapshots.push({
      model: target.model,
      brushId: target.brushId,
      surfaceIndex: target.surfaceIndex,
      previousMapping: brush.getSurfaceMapping(target.surfaceIndex),
    });
    brush.setFaceTextureId(target.surfaceIndex, this.textureId);
    return true;
  }

  /**
   * Restores one face mapping snapshot.
   *
   * @param snapshot Prior mapping state.
   * @returns True when the brush was found.
   */
  private restoreSnapshot(snapshot: FaceTextureSnapshot): boolean {
    const brush = snapshot.model.findBrush(snapshot.brushId);
    if (!brush) return false;
    brush.setFaceMapping(snapshot.surfaceIndex, cloneFaceTextureMapping(snapshot.previousMapping));
    return true;
  }

  /**
   * Records a brush id under its solid model.
   *
   * @param brushesByModel Accumulator.
   * @param model Solid model.
   * @param brushId Brush id.
   */
  private addBrush(brushesByModel: Map<SolidModel, Set<string>>, model: SolidModel, brushId: string): void {
    const set = brushesByModel.get(model);
    if (set) {
      set.add(brushId);
      return;
    }
    brushesByModel.set(model, new Set([brushId]));
  }

  /**
   * Remeshes painted brushes without CSG.
   *
   * @param brushesByModel Brushes grouped by solid model.
   */
  private refreshPresentations(brushesByModel: Map<SolidModel, Set<string>>): void {
    for (const [model, brushIds] of brushesByModel) {
      model.refreshBrushPresentations(Array.from(brushIds));
    }
  }
}
