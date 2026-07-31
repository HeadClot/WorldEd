import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

/** Regular mesh prism parented under the world (or a group). */
export interface ExtrudeMeshCreation {
  kind: 'mesh';
  mesh: THREE.Mesh;
  parent: THREE.Object3D;
}

/** Solid brush prism added under an existing solid model. */
export interface ExtrudeBrushCreation {
  kind: 'brush';
  model: SolidModel;
  instance: SolidBrushInstance;
}

/** One extrude product: either a free mesh or a solid brush. */
export type ExtrudeCreation = ExtrudeMeshCreation | ExtrudeBrushCreation;

/**
 * Undoable command that creates convex prisms from face extrudes. Mesh regions
 * become regular meshes; solid brush regions become new brushes on their solid
 * model. Source geometry is never modified.
 */
export class CommandMeshFacesExtrude implements UndoCommand {
  private creations: ExtrudeCreation[];
  private isDisposed: boolean;
  private executed: boolean;

  /**
   * Creates a command that installs prebuilt extrude products.
   *
   * @param creations Mesh and/or brush products to add on execute.
   */
  constructor(creations: ExtrudeCreation[]) {
    this.creations = creations.slice();
    this.isDisposed = false;
    this.executed = false;
  }

  /**
   * Compatibility constructor path for mesh-only callers.
   *
   * @param createdMeshes Convex prism meshes produced by the extrude.
   * @param parent Scene root or group that will own the new meshes.
   * @returns Mesh-only extrude command.
   */
  static fromMeshes(createdMeshes: THREE.Mesh[], parent: THREE.Object3D): CommandMeshFacesExtrude {
    return new CommandMeshFacesExtrude(createdMeshes.map((mesh) => ({ kind: 'mesh' as const, mesh, parent })));
  }

  /** Adds every extruded mesh and brush if not already present. */
  execute(): void {
    if (this.isDisposed || this.executed) return;
    this.creations.forEach((creation) => this.installCreation(creation));
    this.executed = true;
  }

  /** Removes every extruded product without disposing GPU resources. */
  undo(): void {
    if (this.isDisposed || !this.executed) return;
    for (let index = this.creations.length - 1; index >= 0; index--) {
      this.uninstallCreation(this.creations[index]!);
    }
    this.executed = false;
  }

  /**
   * Returns selectable meshes created by this extrude (regular prisms and brush
   * preview meshes).
   *
   * @returns Created scene meshes.
   */
  getCreatedMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    this.creations.forEach((creation) => {
      if (creation.kind === 'mesh') {
        meshes.push(creation.mesh);
        return;
      }
      if (creation.instance.mesh) {
        meshes.push(creation.instance.mesh);
      }
    });
    return meshes;
  }

  /**
   * Returns the first created mesh, if any (compatibility helper).
   *
   * @returns The first mesh, or null.
   */
  getCreatedMesh(): THREE.Mesh | null {
    const meshes = this.getCreatedMeshes();
    return meshes.length > 0 ? meshes[0]! : null;
  }

  /**
   * Returns solid brush instances created by this extrude.
   *
   * @returns Brush instances (may be empty for mesh-only extrudes).
   */
  getCreatedBrushes(): SolidBrushInstance[] {
    return this.creations
      .filter((creation): creation is ExtrudeBrushCreation => creation.kind === 'brush')
      .map((creation) => creation.instance);
  }

  /** Disposes geometry and materials of permanently dropped creations. */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.creations.forEach((creation) => this.disposeCreation(creation));
    this.creations = [];
    this.executed = false;
  }

  /**
   * Installs one extrude product into the scene graph.
   *
   * @param creation Mesh or brush product.
   */
  private installCreation(creation: ExtrudeCreation): void {
    if (creation.kind === 'mesh') {
      if (creation.mesh.parent === creation.parent) return;
      creation.parent.add(creation.mesh);
      return;
    }
    if (creation.model.findBrush(creation.instance.id)) return;
    creation.model.addBrushInstance(creation.instance);
  }

  /**
   * Removes one extrude product without freeing resources.
   *
   * @param creation Mesh or brush product.
   */
  private uninstallCreation(creation: ExtrudeCreation): void {
    if (creation.kind === 'mesh') {
      if (creation.mesh.parent) {
        creation.mesh.parent.remove(creation.mesh);
      }
      return;
    }
    creation.model.removeBrush(creation.instance.id, false);
  }

  /**
   * Permanently disposes one creation's GPU resources.
   *
   * @param creation Mesh or brush product.
   */
  private disposeCreation(creation: ExtrudeCreation): void {
    if (creation.kind === 'mesh') {
      this.disposeMesh(creation.mesh);
      return;
    }
    if (creation.model.findBrush(creation.instance.id)) {
      creation.model.removeBrush(creation.instance.id, true);
      return;
    }
    if (creation.instance.mesh) {
      creation.model.disposeBrushMeshResources(creation.instance.mesh);
      creation.instance.mesh = null;
    }
  }

  /**
   * Removes and disposes a single created mesh.
   *
   * @param mesh The mesh to dispose.
   */
  private disposeMesh(mesh: THREE.Mesh): void {
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }
    mesh.geometry?.dispose();
    this.disposeMaterial(mesh.material);
    mesh.children.slice().forEach((child) => {
      mesh.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry?.dispose();
        this.disposeMaterial(child.material);
      }
    });
  }

  /**
   * Disposes a material or material array.
   *
   * @param material Material(s) to dispose.
   */
  private disposeMaterial(material: THREE.Material | THREE.Material[]): void {
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
      return;
    }
    material?.dispose();
  }
}
