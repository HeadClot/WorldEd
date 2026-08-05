import * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import type { ComponentTransformVertex } from './component_transform_vertex.js';
import { readComponentTransformVertexLocal, writeComponentTransformVertexLocal } from './component_transform_vertex.js';
import { rebuildComponentTransformDisplays } from './component_transform_apply.js';

/**
 * Undoable component vertex position edit. Stores before/after local positions
 * captured at commit time.
 */
export class CommandComponentPositions implements UndoCommand {
  private readonly vertices: ComponentTransformVertex[];
  private readonly beforeLocals: THREE.Vector3[];
  private readonly afterLocals: THREE.Vector3[];
  private readonly afterDisplaysRebuilt: (() => void) | null;

  /**
   * Creates a command from vertices that already hold final positions. Initial
   * locals must still be present on each vertex descriptor.
   *
   * @param vertices Transform vertices after the live edit.
   * @param afterDisplaysRebuilt Optional presentation refresh (edit cage /
   *   wireframe suppress) run after undo and redo rebuilds.
   */
  constructor(vertices: readonly ComponentTransformVertex[], afterDisplaysRebuilt: (() => void) | null = null) {
    this.vertices = vertices.map((vertex) => ({
      ...vertex,
      initialLocal: vertex.initialLocal.clone(),
    }));
    this.beforeLocals = this.vertices.map((vertex) => vertex.initialLocal.clone());
    this.afterLocals = this.vertices.map((vertex) => readComponentTransformVertexLocal(vertex));
    this.afterDisplaysRebuilt = afterDisplaysRebuilt;
  }

  /** Re-applies the post-edit vertex positions. */
  execute(): void {
    this.writeLocals(this.afterLocals);
  }

  /** Restores pre-edit vertex positions. */
  undo(): void {
    this.writeLocals(this.beforeLocals);
  }

  /**
   * Writes a parallel local-position list onto the vertex set and rebuilds.
   *
   * @param locals Local positions.
   */
  private writeLocals(locals: readonly THREE.Vector3[]): void {
    for (let index = 0; index < this.vertices.length; index++) {
      const vertex = this.vertices[index]!;
      const local = locals[index]!;
      writeComponentTransformVertexLocal(vertex, local);
      vertex.initialLocal.copy(local);
    }
    rebuildComponentTransformDisplays(this.vertices);
    this.afterDisplaysRebuilt?.();
  }
}
