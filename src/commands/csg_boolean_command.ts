import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import { restoreObjectAtIndex } from '../utils/hierarchy_utils.js';

/** Undoable command that replaces two source meshes with a CSG result mesh. */
export class CsgBooleanCommand implements UndoCommand {
  private meshA: THREE.Mesh;
  private meshB: THREE.Mesh;
  private resultMesh: THREE.Mesh;
  private worldGroup: THREE.Group;
  private parentA: THREE.Object3D | null;
  private parentB: THREE.Object3D | null;
  private indexA: number;
  private indexB: number;
  private executed: boolean;

  /**
   * Creates a CSG boolean command.
   *
   * @param meshA The first source mesh.
   * @param meshB The second source mesh.
   * @param resultMesh The CSG result mesh to insert.
   * @param worldGroup The world root used when parents are missing.
   */
  constructor(meshA: THREE.Mesh, meshB: THREE.Mesh, resultMesh: THREE.Mesh, worldGroup: THREE.Group) {
    this.meshA = meshA;
    this.meshB = meshB;
    this.resultMesh = resultMesh;
    this.worldGroup = worldGroup;
    this.parentA = meshA.parent;
    this.parentB = meshB.parent;
    this.indexA = meshA.parent ? meshA.parent.children.indexOf(meshA) : 0;
    this.indexB = meshB.parent ? meshB.parent.children.indexOf(meshB) : 0;
    this.executed = false;
  }

  /** Removes the source meshes and inserts the result mesh. */
  execute(): void {
    if (this.executed) return;
    this.parentA?.remove(this.meshA);
    this.parentB?.remove(this.meshB);
    const insertParent = this.parentA ?? this.worldGroup;
    insertParent.add(this.resultMesh);
    this.executed = true;
  }

  /** Restores the source meshes and removes the result mesh. */
  undo(): void {
    if (!this.executed) return;
    this.resultMesh.parent?.remove(this.resultMesh);
    restoreObjectAtIndex(this.meshA, this.parentA, this.indexA, this.worldGroup);
    restoreObjectAtIndex(this.meshB, this.parentB, this.indexB, this.worldGroup);
    this.executed = false;
  }

  /**
   * Returns the resulting CSG mesh.
   *
   * @returns The result mesh.
   */
  getResultMesh(): THREE.Mesh {
    return this.resultMesh;
  }
}
