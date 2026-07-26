import * as THREE from 'three';
import { UndoCommand } from '../undo_command.js';
import {
  FaceTextureAlign,
  FaceTextureMapEntry,
  FaceTextureMapping,
  cloneFaceTextureMapEntry,
  cloneFaceTextureMapping,
  createDefaultFaceTextureMapping,
} from '../../texture/uv/face_texture_mapping.js';
import {
  getFaceTextureMaps,
  getFaceTextureMapsLive,
  setFaceTextureMaps,
} from '../../texture/uv/face_texture_storage.js';
import {
  applyAlignToTargets,
  applyMappingToTargets,
  applyPartialTrsToTargets,
  applyRelativeTrsToTargets,
  resetUvParamsOnTargets,
  TextureApplyTarget,
} from '../../texture/uv/face_texture_applier.js';
import { rebakeStoredFaceTextureMaps } from '../../texture/uv/planar_uv_projector.js';
import { rebuildSurfaceMaterials } from '../../texture/material/surface_material_builder.js';
import { SolidModel } from '../../solid/model/solid_model.js';
import type { BrushUvSnapshot } from '../../solid/model/solid_model_presentation.js';
import type { FaceTextureMappingTrs } from '../../texture/uv/face_texture_mapping.js';
import type { UvRelativeTrsOp } from '../../texture/uv/uv_trs_ops.js';

/** Snapshot of one mesh's texture state for undo. */
interface MeshTextureSnapshot {
  mesh: THREE.Mesh;
  maps: FaceTextureMapEntry[];
  uvArray: Float32Array | null;
  /**
   * Authored solid brush UV state before the edit. When present, undo/redo
   * remeshes from brush authorship instead of replaying stale result UV buffers
   * (critical after VMF-scale partial remesh).
   */
  solidBrushUvs: BrushUvSnapshot[] | null;
}

/** Options for applying face texture / UV changes. */
export interface ApplyFaceTextureCommandOptions {
  /**
   * When true, resets UV params only and keeps each region's textureId. The
   * mapping argument is ignored for texture identity.
   */
  resetUvOnly?: boolean;
  /** When set, only the align preset is changed; scale/offset/rotation stay. */
  alignOnly?: FaceTextureAlign;
  /** Relative TRS op applied per target (multi-select safe). */
  relativeOp?: UvRelativeTrsOp;
  /** Absolute TRS fields written onto every target (partial multi-edit). */
  partialTrs?: Partial<FaceTextureMappingTrs>;
}

/** Undoable command that applies a face texture mapping to mesh regions. */
export class ApplyFaceTextureCommand implements UndoCommand {
  private targets: TextureApplyTarget[];
  private mapping: FaceTextureMapping;
  private resetUvOnly: boolean;
  private alignOnly: FaceTextureAlign | null;
  private relativeOp: UvRelativeTrsOp | null;
  private partialTrs: Partial<FaceTextureMappingTrs> | null;
  private beforeSnapshots: MeshTextureSnapshot[];
  private afterSolidBrushUvs: BrushUvSnapshot[] | null;
  private executed: boolean;

  /**
   * Creates a texture apply command.
   *
   * @param targets Regions that will receive the mapping.
   * @param mapping Mapping parameters to apply (UV defaults when resetUvOnly).
   * @param options Optional apply behavior flags.
   */
  constructor(
    targets: TextureApplyTarget[],
    mapping: FaceTextureMapping = createDefaultFaceTextureMapping(),
    options: ApplyFaceTextureCommandOptions = {},
  ) {
    this.targets = targets;
    this.mapping = cloneFaceTextureMapping(mapping);
    this.resetUvOnly = options.resetUvOnly === true;
    this.alignOnly = options.alignOnly ?? null;
    this.relativeOp = options.relativeOp ?? null;
    this.partialTrs = options.partialTrs ? { ...options.partialTrs } : null;
    this.beforeSnapshots = [];
    this.afterSolidBrushUvs = null;
    this.executed = false;
  }

  /** Applies the mapping and bakes UVs, capturing prior state for undo. */
  execute(): void {
    if (this.executed) {
      this.replayAfterState();
      return;
    }
    this.beforeSnapshots = this.captureSnapshots();
    this.runApplyPath();
    this.syncSolidBrushMappingsFromTargets();
    this.afterSolidBrushUvs = this.captureSolidBrushUvsFromTargets();
    this.executed = true;
  }

  /** Runs the selected apply path (reset, align, relative, partial, or full). */
  private runApplyPath(): void {
    if (this.resetUvOnly) {
      resetUvParamsOnTargets(this.targets);
      return;
    }
    if (this.alignOnly) {
      applyAlignToTargets(this.targets, this.alignOnly);
      return;
    }
    if (this.relativeOp) {
      applyRelativeTrsToTargets(this.targets, this.relativeOp);
      return;
    }
    if (this.partialTrs) {
      applyPartialTrsToTargets(this.targets, this.partialTrs);
      return;
    }
    applyMappingToTargets(this.targets, this.mapping);
  }

  /** Restores prior authored solid UV state (or content mesh UVs). */
  undo(): void {
    if (!this.executed) return;
    this.beforeSnapshots.forEach((snapshot) => {
      this.restoreSnapshot(snapshot);
    });
    this.executed = false;
  }

  /** Re-applies the post-edit solid brush UV state on redo after a prior undo. */
  private replayAfterState(): void {
    if (!this.afterSolidBrushUvs) {
      this.runApplyPath();
      return;
    }
    const model = this.findSolidModelFromTargets();
    if (!model) return;
    model.restoreBrushUvSnapshots(this.afterSolidBrushUvs);
    this.remeshAllBrushes(model);
  }

  /**
   * Pushes edited triangle regions onto solid brush faces and remeshes once per
   * model. All post-apply mappings are captured first so multi-select UV edits
   * survive (a per-target remesh would rebuild result maps and drop later
   * faces).
   */
  private syncSolidBrushMappingsFromTargets(): void {
    const pendingByModel = this.captureSolidWritebacksFromTargets();
    pendingByModel.forEach((regions, model) => {
      model.syncAuthoredMappingsForRegions(regions);
    });
  }

  /**
   * Snapshots each solid target's applied mapping while result face maps still
   * hold the UV editor changes (before any remesh).
   *
   * @returns Regions to write, grouped by solid model.
   */
  private captureSolidWritebacksFromTargets(): Map<
    SolidModel,
    Array<{ triangleIndices: number[]; mapping: FaceTextureMapping }>
  > {
    const pendingByModel = new Map<SolidModel, Array<{ triangleIndices: number[]; mapping: FaceTextureMapping }>>();
    for (const target of this.targets) {
      if (!SolidModel.isResultMesh(target.mesh)) continue;
      const model = SolidModel.fromObject(target.mesh);
      if (!model) continue;
      const regions = pendingByModel.get(model) ?? [];
      regions.push({
        triangleIndices: target.triangleIndices.slice(),
        mapping: this.resolveTargetMapping(target),
      });
      pendingByModel.set(model, regions);
    }
    return pendingByModel;
  }

  /**
   * Reads the mapping currently stored for a target region after apply.
   *
   * @param target Edited region.
   * @returns Mapping for solid brush write-back.
   */
  private resolveTargetMapping(target: TextureApplyTarget): FaceTextureMapping {
    const entries = getFaceTextureMapsLive(target.mesh);
    const indexSet = new Set(target.triangleIndices);
    for (const entry of entries) {
      if (entry.triangleIndices.some((index) => indexSet.has(index))) {
        return cloneFaceTextureMapping(entry.mapping);
      }
    }
    return cloneFaceTextureMapping(this.mapping);
  }

  /**
   * Captures unique meshes referenced by targets, including solid brush UVs.
   *
   * @returns Snapshots for undo.
   */
  private captureSnapshots(): MeshTextureSnapshot[] {
    const meshes = new Set<THREE.Mesh>();
    this.targets.forEach((target) => meshes.add(target.mesh));
    const snapshots: MeshTextureSnapshot[] = [];
    meshes.forEach((mesh) => {
      snapshots.push(this.snapshotMesh(mesh));
    });
    return snapshots;
  }

  /**
   * Snapshots maps, UV buffer, and solid brush authorship for one mesh.
   *
   * @param mesh Mesh to capture.
   * @returns Snapshot object.
   */
  private snapshotMesh(mesh: THREE.Mesh): MeshTextureSnapshot {
    const maps = getFaceTextureMaps(mesh).map((entry) => cloneFaceTextureMapEntry(entry));
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | null;
    const uvArray = uv ? new Float32Array(uv.array as ArrayLike<number>) : null;
    return {
      mesh,
      maps,
      uvArray,
      solidBrushUvs: this.captureSolidBrushUvs(mesh),
    };
  }

  /**
   * Captures all brush UV authorship when the mesh is a solid result.
   *
   * @param mesh Candidate mesh.
   * @returns Brush UV snapshots, or null when not a solid result.
   */
  private captureSolidBrushUvs(mesh: THREE.Mesh): BrushUvSnapshot[] | null {
    if (!SolidModel.isResultMesh(mesh)) return null;
    const model = SolidModel.fromObject(mesh);
    if (!model) return null;
    return model.captureBrushUvSnapshots();
  }

  /**
   * Captures solid brush UV state after an edit for redo.
   *
   * @returns Brush snapshots, or null when targets are not solid results.
   */
  private captureSolidBrushUvsFromTargets(): BrushUvSnapshot[] | null {
    for (const target of this.targets) {
      const captured = this.captureSolidBrushUvs(target.mesh);
      if (captured) return captured;
    }
    return null;
  }

  /**
   * Restores a mesh snapshot. Solid results remesh from brush authorship so
   * triangle indices and UV buffers stay consistent with CSG chunks.
   *
   * @param snapshot Prior state.
   */
  private restoreSnapshot(snapshot: MeshTextureSnapshot): void {
    if (snapshot.solidBrushUvs) {
      const model = SolidModel.fromObject(snapshot.mesh);
      if (model) {
        model.restoreBrushUvSnapshots(snapshot.solidBrushUvs);
        this.remeshAllBrushes(model);
        return;
      }
    }
    setFaceTextureMaps(snapshot.mesh, snapshot.maps);
    if (snapshot.uvArray) {
      this.restoreUvArray(snapshot.mesh, snapshot.uvArray);
    } else {
      rebakeStoredFaceTextureMaps(snapshot.mesh);
    }
    rebuildSurfaceMaterials(snapshot.mesh, undefined, undefined, {
      preserveTriangleOrder: true,
    });
  }

  /**
   * Remeshes every brush chunk from authored UV surfaces and refreshes result
   * materials/maps. Used by solid undo/redo so triangle layout stays stable.
   *
   * @param model Solid model to remesh.
   */
  private remeshAllBrushes(model: SolidModel): void {
    const brushIds = model.getBrushes().map((brush) => brush.id);
    model.refreshBrushPresentations(brushIds);
  }

  /**
   * Finds a solid model from the command targets.
   *
   * @returns Solid model or null.
   */
  private findSolidModelFromTargets(): SolidModel | null {
    for (const target of this.targets) {
      if (!SolidModel.isResultMesh(target.mesh)) continue;
      const model = SolidModel.fromObject(target.mesh);
      if (model) return model;
    }
    return null;
  }

  /**
   * Writes a saved UV array back onto geometry.
   *
   * @param mesh Target mesh.
   * @param uvArray Saved interleaved UVs.
   */
  private restoreUvArray(mesh: THREE.Mesh, uvArray: Float32Array): void {
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | null;
    if (uv && uv.array.length === uvArray.length) {
      (uv.array as Float32Array).set(uvArray);
      uv.needsUpdate = true;
      return;
    }
    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray.slice(), 2));
  }
}
