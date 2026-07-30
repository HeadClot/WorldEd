import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { collectMeshesUnder, sortObjectsBySceneOrder } from '@/utils/utils_hierarchy.js';

/** Snapshot of one solid brush duplication for undo. */
interface SolidBrushDuplicateEntry {
  kind: 'brush';
  model: SolidModel;
  sourceBrushId: string;
  createdBrushId: string;
}

/** Snapshot of one solid CSG group duplication for undo. */
interface SolidGroupDuplicateEntry {
  kind: 'group';
  model: SolidModel;
  createdGroup: THREE.Group;
  createdBrushIds: string[];
}

type SolidDuplicateEntry = SolidBrushDuplicateEntry | SolidGroupDuplicateEntry;

/**
 * Undoable command that duplicates solid brushes and solid CSG groups inside
 * their solid models, preserving hierarchy parents.
 */
export class CommandSolidDuplicateBrushes implements UndoCommand {
  private readonly sourceNodes: THREE.Object3D[];
  private readonly offset: THREE.Vector3;
  private readonly entries: SolidDuplicateEntry[];
  private clonedMeshes: THREE.Mesh[];
  private clonedInspectorRoots: THREE.Object3D[];
  private executed: boolean;

  /**
   * Creates a solid hierarchy duplication command.
   *
   * @param sourceNodes Brush meshes and/or solid CSG groups to duplicate.
   * @param offset Local offset applied to each top-level clone.
   */
  constructor(sourceNodes: THREE.Object3D[], offset: THREE.Vector3) {
    this.sourceNodes = sortObjectsBySceneOrder(sourceNodes);
    this.offset = offset.clone();
    this.entries = [];
    this.clonedMeshes = [];
    this.clonedInspectorRoots = [];
    this.executed = false;
  }

  /**
   * Duplicates each source node under its solid model. Nodes are processed in
   * outliner / scene-graph order so CSG evaluation order is stable.
   */
  execute(): void {
    if (this.executed) return;
    this.entries.length = 0;
    this.clonedMeshes = [];
    this.clonedInspectorRoots = [];
    for (const node of this.sourceNodes) {
      this.duplicateOne(node);
    }
    this.executed = true;
  }

  /** Removes created brushes/groups and rebuilds each affected solid model. */
  undo(): void {
    for (let index = this.entries.length - 1; index >= 0; index--) {
      this.undoOne(this.entries[index]!);
    }
    this.entries.length = 0;
    this.clonedMeshes = [];
    this.clonedInspectorRoots = [];
    this.executed = false;
  }

  /**
   * Returns the cloned brush preview meshes created by execute.
   *
   * @returns Clone meshes.
   */
  getClonedMeshes(): THREE.Mesh[] {
    return this.clonedMeshes.slice();
  }

  /**
   * Returns hierarchy roots to select after duplicate (groups and/or brushes).
   *
   * @returns Cloned inspector roots.
   */
  getClonedInspectorRoots(): THREE.Object3D[] {
    return this.clonedInspectorRoots.slice();
  }

  /**
   * Duplicates a single solid brush or solid CSG group.
   *
   * @param node Source hierarchy node.
   */
  private duplicateOne(node: THREE.Object3D): void {
    if (isSolidCsgGroup(node) && node instanceof THREE.Group) {
      this.duplicateGroup(node);
      return;
    }
    if (node instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(node)) {
      this.duplicateBrushMesh(node);
    }
  }

  /**
   * Duplicates one solid brush mesh into its solid model.
   *
   * @param mesh Source brush mesh.
   */
  private duplicateBrushMesh(mesh: THREE.Mesh): void {
    const model = SolidModel.fromObject(mesh);
    if (!model) return;
    const source = model.findBrushByMesh(mesh);
    if (!source) return;
    const created = model.duplicateBrush(source.id, this.offset);
    if (!created) return;
    this.entries.push({
      kind: 'brush',
      model,
      sourceBrushId: source.id,
      createdBrushId: created.id,
    });
    if (created.mesh) {
      this.clonedMeshes.push(created.mesh);
      this.clonedInspectorRoots.push(created.mesh);
    }
  }

  /**
   * Duplicates a solid CSG group and registers created brush ids for undo.
   *
   * @param group Source solid CSG group.
   */
  private duplicateGroup(group: THREE.Group): void {
    const model = SolidModel.fromObject(group);
    if (!model) return;
    const brushIdsBefore = new Set(model.getBrushes().map((brush) => brush.id));
    const createdGroup = model.duplicateSolidCsgGroup(group, this.offset);
    if (!createdGroup) return;
    const createdBrushIds = model
      .getBrushes()
      .filter((brush) => !brushIdsBefore.has(brush.id))
      .map((brush) => brush.id);
    this.entries.push({
      kind: 'group',
      model,
      createdGroup,
      createdBrushIds,
    });
    this.clonedInspectorRoots.push(createdGroup);
    collectMeshesUnder(createdGroup).forEach((mesh) => {
      if (SolidBrushVisual.isBrushObject(mesh)) this.clonedMeshes.push(mesh);
    });
  }

  /**
   * Undoes one duplicate entry.
   *
   * @param entry Brush or group snapshot.
   */
  private undoOne(entry: SolidDuplicateEntry): void {
    if (entry.kind === 'brush') {
      entry.model.removeBrush(entry.createdBrushId);
      return;
    }
    for (const brushId of entry.createdBrushIds) {
      entry.model.removeBrush(brushId, false);
    }
    entry.createdGroup.parent?.remove(entry.createdGroup);
    entry.model.syncBrushOrderFromScene();
    entry.model.markDirty();
    entry.model.rebuild(true);
  }
}
