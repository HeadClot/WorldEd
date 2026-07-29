import * as THREE from 'three';
import { UndoCommand } from '../../commands/undo_command.js';
import { SolidModel } from '../../solid/model/solid_model.js';
import { SolidBrushInstance } from '../../solid/model/solid_brush_instance.js';
import { SolidOperation } from '../../solid/types/solid_operation.js';
import { SolidBrushFactory } from '../../solid/brush/solid_brush_factory.js';

/**
 * Undoable command that adds a sized box brush under a solid model for the AI
 * EditorApi path (supports non-uniform size).
 */
export class EditorApiAddBoxCommand implements UndoCommand {
  private readonly model: SolidModel;
  private readonly width: number;
  private readonly height: number;
  private readonly depth: number;
  private readonly operation: SolidOperation;
  private readonly position: THREE.Vector3;
  private readonly rotation: THREE.Euler;
  private readonly scale: THREE.Vector3;
  private created: SolidBrushInstance | null;
  private listIndex: number;
  private executed: boolean;

  /**
   * Creates an add-box command with full TRS.
   *
   * @param model Target solid model.
   * @param size Box dimensions.
   * @param operation CSG operation.
   * @param position Local position.
   * @param rotation Local rotation.
   * @param scale Local scale.
   */
  constructor(
    model: SolidModel,
    size: THREE.Vector3,
    operation: SolidOperation,
    position: THREE.Vector3,
    rotation: THREE.Euler,
    scale: THREE.Vector3,
  ) {
    this.model = model;
    this.width = size.x;
    this.height = size.y;
    this.depth = size.z;
    this.operation = operation;
    this.position = position.clone();
    this.rotation = rotation.clone();
    this.scale = scale.clone();
    this.created = null;
    this.listIndex = -1;
    this.executed = false;
  }

  /** Creates the brush on first run, or re-inserts it on redo. */
  execute(): void {
    if (this.executed) return;
    if (this.created) this.reinsertCreatedBrush();
    else this.createBrush();
    this.executed = true;
  }

  /** Removes the created brush without disposing preview resources. */
  undo(): void {
    if (!this.executed || !this.created) return;
    this.model.removeBrush(this.created.id, false);
    this.executed = false;
  }

  /**
   * Returns the brush created by this command when available.
   *
   * @returns Created brush instance or null.
   */
  getCreatedBrush(): SolidBrushInstance | null {
    return this.created;
  }

  /** Builds a new box brush, applies TRS, and records its list index. */
  private createBrush(): void {
    const topology = SolidBrushFactory.createCenteredBox(this.width, this.height, this.depth);
    const instance = this.model.prepareTopologyBrush(topology, this.operation, this.position);
    instance.rotation.copy(this.rotation);
    instance.scale.copy(this.scale);
    instance.pushTransformToMesh();
    this.model.addBrushInstance(instance, Math.max(this.width, this.height, this.depth));
    this.created = instance;
    this.listIndex = this.model.getBrushes().findIndex((entry) => entry.id === instance.id);
  }

  /** Re-inserts a previously created brush at its recorded index. */
  private reinsertCreatedBrush(): void {
    if (!this.created) return;
    if (this.model.findBrush(this.created.id)) return;
    this.created.pushTransformToMesh();
    this.model.insertBrushInstance(this.created, this.listIndex, Math.max(this.width, this.height, this.depth));
  }
}
