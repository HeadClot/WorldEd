import * as THREE from 'three';
import { UndoCommand } from '../undo_command.js';
import { SolidModel } from '../../solid/model/solid_model.js';
import { SolidBrushVisual } from '../../solid/model/solid_brush_visual.js';
import { FaceTextureMapping, cloneFaceTextureMapping } from '../../texture/uv/face_texture_mapping.js';

/** Snapshot of one brush texture assignment for undo. */
interface BrushTextureSnapshot {
  model: SolidModel;
  brushId: string;
  previousDefaultMapping: FaceTextureMapping;
  previousFaceMappings: (FaceTextureMapping | undefined)[];
}

/**
 * Undoable command that assigns a texture to solid brushes (not helper meshes).
 * Textures are stored per brush and baked into the compiled result mesh.
 * Presentation-only: remeshes painted brushes, never force-rebuilds CSG.
 */
export class AssignSolidBrushTextureCommand implements UndoCommand {
  private readonly brushMeshes: THREE.Mesh[];
  private readonly textureId: string;
  private snapshots: BrushTextureSnapshot[];
  private executed: boolean;

  /**
   * Creates a solid-brush texture assignment command.
   *
   * @param brushMeshes Selected solid brush preview meshes.
   * @param textureId Texture identity to apply.
   */
  constructor(brushMeshes: THREE.Mesh[], textureId: string) {
    this.brushMeshes = brushMeshes.slice();
    this.textureId = textureId;
    this.snapshots = [];
    this.executed = false;
  }

  /** Applies the texture to each brush and remeshes presentation. */
  execute(): void {
    if (this.executed) return;
    this.snapshots = [];
    const brushesByModel = new Map<SolidModel, Set<string>>();
    for (const mesh of this.brushMeshes) {
      const applied = this.applyToMesh(mesh);
      if (!applied) continue;
      this.addBrush(brushesByModel, applied.model, applied.brushId);
    }
    this.refreshPresentations(brushesByModel);
    this.executed = true;
  }

  /** Restores prior brush surface and per-face textures, then remeshes. */
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
   * Filters an array of meshes down to solid brush previews.
   *
   * @param meshes Candidate meshes.
   * @returns Solid brush meshes only.
   */
  static filterBrushMeshes(meshes: THREE.Mesh[]): THREE.Mesh[] {
    return meshes.filter((mesh) => SolidBrushVisual.isBrushObject(mesh));
  }

  /**
   * Snapshots and paints one brush mesh.
   *
   * @param mesh Brush preview mesh.
   * @returns Model and brush id when applied, otherwise null.
   */
  private applyToMesh(mesh: THREE.Mesh): { model: SolidModel; brushId: string } | null {
    const model = SolidModel.fromObject(mesh);
    if (!model) return null;
    const brush = model.findBrushByMesh(mesh);
    if (!brush) return null;
    this.snapshots.push({
      model,
      brushId: brush.id,
      previousDefaultMapping: brush.serializeDefaultMapping(),
      previousFaceMappings: brush.serializeFaceMappings(),
    });
    brush.setAllFacesTextureId(this.textureId);
    return { model, brushId: brush.id };
  }

  /**
   * Restores one brush texture snapshot.
   *
   * @param snapshot Prior texture state.
   * @returns True when the brush was found and restored.
   */
  private restoreSnapshot(snapshot: BrushTextureSnapshot): boolean {
    const brush = snapshot.model.findBrush(snapshot.brushId);
    if (!brush) return false;
    brush.restoreFaceMappings(
      cloneFaceTextureMapping(snapshot.previousDefaultMapping),
      snapshot.previousFaceMappings.map((mapping) => (mapping ? cloneFaceTextureMapping(mapping) : undefined)),
    );
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
