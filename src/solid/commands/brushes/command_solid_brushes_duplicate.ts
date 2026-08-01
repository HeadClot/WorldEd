import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { createIndependentSolidModelDuplicate } from '@/solid/model/solid_model_duplicate.js';
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

/** Snapshot of one independent solid model duplication for undo. */
interface SolidModelDuplicateEntry {
  kind: 'model';
  model: SolidModel;
}

type SolidDuplicateEntry = SolidBrushDuplicateEntry | SolidGroupDuplicateEntry | SolidModelDuplicateEntry;

/**
 * Undoable command that duplicates solid brushes, solid CSG groups, and entire
 * solid model roots. Brush and group clones stay inside their solid models.
 * Solid model roots become independent sibling models.
 */
export class CommandSolidBrushesDuplicate implements UndoCommand {
  private readonly sourceNodes: THREE.Object3D[];
  private readonly offset: THREE.Vector3;
  private readonly entries: SolidDuplicateEntry[];
  private clonedMeshes: THREE.Mesh[];
  private clonedInspectorRoots: THREE.Object3D[];
  private executed: boolean;

  /**
   * Creates a solid hierarchy duplication command.
   *
   * @param sourceNodes Solid model roots, brush meshes, and/or solid CSG groups
   *   to duplicate.
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
   * Duplicates each source node. Nodes are processed in outliner / scene-graph
   * order so CSG evaluation order is stable.
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

  /** Removes created brushes, groups, or solid models from the scene. */
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
   * Returns hierarchy roots to select after duplicate (models, groups, and/or
   * brushes).
   *
   * @returns Cloned inspector roots.
   */
  getClonedInspectorRoots(): THREE.Object3D[] {
    return this.clonedInspectorRoots.slice();
  }

  /**
   * Duplicates a single solid model root, solid CSG group, or solid brush.
   *
   * @param node Source hierarchy node.
   */
  private duplicateOne(node: THREE.Object3D): void {
    if (SolidModel.isSolidModelObject(node) && node instanceof THREE.Group) {
      this.duplicateSolidModelRoot(node);
      return;
    }
    if (isSolidCsgGroup(node) && node instanceof THREE.Group) {
      this.duplicateGroup(node);
      return;
    }
    if (node instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(node)) {
      this.duplicateBrushMesh(node);
    }
  }

  /**
   * Duplicates an entire solid model as an independent sibling under the same
   * parent.
   *
   * @param root Source solid model root group.
   */
  private duplicateSolidModelRoot(root: THREE.Group): void {
    const sourceModel = SolidModel.fromObject(root);
    if (!sourceModel) return;
    const parent = root.parent;
    if (!parent) return;
    const cloneModel = createIndependentSolidModelDuplicate(sourceModel, this.offset);
    parent.add(cloneModel.root);
    this.insertObjectAfterSibling(parent, cloneModel.root, root);
    this.recordSolidModelDuplicate(cloneModel);
  }

  /**
   * Records a solid model clone for selection and undo.
   *
   * @param cloneModel Newly created solid model.
   */
  private recordSolidModelDuplicate(cloneModel: SolidModel): void {
    this.entries.push({ kind: 'model', model: cloneModel });
    this.clonedInspectorRoots.push(cloneModel.root);
    this.collectBrushMeshesFromObject(cloneModel.root);
  }

  /**
   * Collects solid brush preview meshes under an object into clonedMeshes.
   *
   * @param root Object tree to scan.
   */
  private collectBrushMeshesFromObject(root: THREE.Object3D): void {
    collectMeshesUnder(root).forEach((mesh) => {
      if (SolidBrushVisual.isBrushObject(mesh)) {
        this.clonedMeshes.push(mesh);
      }
    });
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
    this.collectBrushMeshesFromObject(createdGroup);
  }

  /**
   * Places an object immediately after a sibling under the same parent.
   *
   * @param parent Shared parent.
   * @param object Object to place.
   * @param sibling Sibling that should precede the object.
   */
  private insertObjectAfterSibling(parent: THREE.Object3D, object: THREE.Object3D, sibling: THREE.Object3D): void {
    const siblingIndex = parent.children.indexOf(sibling);
    const currentIndex = parent.children.indexOf(object);
    if (siblingIndex < 0 || currentIndex < 0) return;
    parent.children.splice(currentIndex, 1);
    const insertIndex = Math.min(siblingIndex + 1, parent.children.length);
    parent.children.splice(insertIndex, 0, object);
  }

  /**
   * Undoes one duplicate entry.
   *
   * @param entry Brush, group, or model snapshot.
   */
  private undoOne(entry: SolidDuplicateEntry): void {
    if (entry.kind === 'model') {
      this.undoSolidModelDuplicate(entry);
      return;
    }
    if (entry.kind === 'brush') {
      entry.model.removeBrush(entry.createdBrushId);
      return;
    }
    this.undoGroupDuplicate(entry);
  }

  /**
   * Removes a duplicated solid model root from the scene.
   *
   * @param entry Model duplicate snapshot.
   */
  private undoSolidModelDuplicate(entry: SolidModelDuplicateEntry): void {
    entry.model.root.parent?.remove(entry.model.root);
  }

  /**
   * Removes brushes and group created by a CSG group duplicate.
   *
   * @param entry Group duplicate snapshot.
   */
  private undoGroupDuplicate(entry: SolidGroupDuplicateEntry): void {
    for (const brushId of entry.createdBrushIds) {
      entry.model.removeBrush(brushId, false, false);
    }
    entry.createdGroup.parent?.remove(entry.createdGroup);
    entry.model.syncBrushOrderFromScene();
    entry.model.rebuild(true);
  }
}
