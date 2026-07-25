import * as THREE from 'three';
import { SolidBrushInstance } from './solid_brush_instance.js';
import { SolidBrushVisual } from './solid_brush_visual.js';

/**
 * Owns the ordered brush list and preview mesh sibling layout for a solid
 * model. Does not run CSG or rebuild result geometry.
 */
export class SolidBrushCollection {
  private brushes: SolidBrushInstance[] = [];
  private brushCounter = 0;

  /**
   * Creates a brush collection bound to a solid model root.
   *
   * @param root Solid model root group that owns brush preview meshes.
   */
  constructor(private readonly root: THREE.Group) {}

  /**
   * Returns brush instances in evaluation order.
   *
   * @returns Brush list copy.
   */
  getBrushes(): SolidBrushInstance[] {
    return this.brushes.slice();
  }

  /**
   * Returns the live evaluation list (not a copy) for compile and iteration.
   *
   * @returns Internal brush array.
   */
  getEvaluationList(): SolidBrushInstance[] {
    return this.brushes;
  }

  /**
   * Returns the number of brushes.
   *
   * @returns Brush count.
   */
  getBrushCount(): number {
    return this.brushes.length;
  }

  /**
   * Finds a brush by id.
   *
   * @param id Brush id.
   * @returns Brush or undefined.
   */
  findBrush(id: string): SolidBrushInstance | undefined {
    return this.brushes.find((brush) => brush.id === id);
  }

  /**
   * Finds a brush by its scene mesh.
   *
   * @param mesh Candidate mesh.
   * @returns Brush or undefined.
   */
  findBrushByMesh(mesh: THREE.Object3D): SolidBrushInstance | undefined {
    return this.brushes.find((brush) => brush.mesh === mesh);
  }

  /**
   * Increments the brush counter and returns the new value.
   *
   * @returns Updated brush counter.
   */
  nextBrushCounter(): number {
    this.brushCounter += 1;
    return this.brushCounter;
  }

  /**
   * Allocates a unique brush id using the root uuid and counter.
   *
   * @returns Unique string id.
   */
  allocateBrushId(): string {
    return `${this.root.uuid}-brush-${this.brushCounter}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Appends a brush that already has a preview mesh attached.
   *
   * @param instance Brush instance to own.
   */
  appendPreparedBrush(instance: SolidBrushInstance): void {
    if (this.findBrush(instance.id)) return;
    this.brushes.push(instance);
  }

  /**
   * Registers a brush at a list index, ensuring preview mesh and sibling order.
   *
   * @param instance Brush instance to own.
   * @param listIndex Desired index in the evaluation list.
   * @param previewSize Default box preview edge length when mesh is missing.
   */
  registerBrushAt(instance: SolidBrushInstance, listIndex: number, previewSize: number): void {
    if (this.findBrush(instance.id)) return;
    this.ensureBrushPreviewMesh(instance, previewSize);
    const clampedIndex = Math.max(0, Math.min(listIndex, this.brushes.length));
    this.brushes.splice(clampedIndex, 0, instance);
    this.applyBrushMeshSiblingOrder();
  }

  /**
   * Removes a brush from the evaluation list without disposing scene resources.
   *
   * @param id Brush id.
   * @returns Removed brush or undefined when missing.
   */
  removeBrushFromList(id: string): SolidBrushInstance | undefined {
    const index = this.brushes.findIndex((brush) => brush.id === id);
    if (index < 0) return undefined;
    const [brush] = this.brushes.splice(index, 1);
    return brush;
  }

  /**
   * Creates and attaches a hull preview matching the brush solid when missing.
   * Falls back to a sized box only when the brush topology is empty.
   *
   * @param instance Brush instance.
   * @param previewSize Fallback box edge length when hull data is missing.
   */
  ensureBrushPreviewMesh(instance: SolidBrushInstance, previewSize: number): void {
    if (instance.mesh) {
      instance.pushTransformToMesh();
      return;
    }
    if (instance.brush.faces.length >= 4 && instance.brush.vertices.length >= 4) {
      this.attachHullPreview(instance);
      return;
    }
    this.attachBoxPreview(instance, previewSize);
  }

  /**
   * Estimates a box preview edge length from brush local bounds.
   *
   * @param source Brush to measure.
   * @returns Preview cube size.
   */
  estimateBrushPreviewSize(source: SolidBrushInstance): number {
    const bounds = source.brush.computeLocalBounds();
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const maxAxis = Math.max(size.x, size.y, size.z);
    return maxAxis > 1e-6 ? maxAxis : 2;
  }

  /**
   * Reorders brush preview meshes under the root to match evaluation list
   * order.
   */
  applyBrushMeshSiblingOrder(): void {
    for (const brush of this.brushes) {
      if (!brush.mesh) continue;
      this.root.add(brush.mesh);
    }
  }

  /**
   * Reorders the internal brush list to match outliner / scene-graph sibling
   * order.
   */
  syncBrushOrderFromScene(): void {
    const ordered: SolidBrushInstance[] = [];
    const remaining = new Map(this.brushes.map((brush) => [brush.id, brush] as const));
    for (const child of this.root.children) {
      this.collectBrushChildIfOwned(child, ordered, remaining);
    }
    remaining.forEach((brush) => ordered.push(brush));
    this.brushes = ordered;
  }

  /**
   * Returns evaluation-list indices for the given brush ids.
   *
   * @param brushIds Brush ids to look up.
   * @returns Parallel list of indices (-1 when missing).
   */
  getBrushOrderIndices(brushIds: readonly string[]): number[] {
    return brushIds.map((brushId) => this.brushes.findIndex((brush) => brush.id === brushId));
  }

  /**
   * Moves listed brushes to the first or last evaluation slots (list only).
   *
   * @param brushIds Brushes to move (unknown ids ignored).
   * @param end Which end of the evaluation list to place them on.
   * @returns True when order changed.
   */
  reorderBrushesToEnd(brushIds: readonly string[], end: 'first' | 'last'): boolean {
    const moving = this.collectMovingBrushes(brushIds);
    if (moving.length === 0) return false;
    const movingIds = new Set(moving.map((brush) => brush.id));
    const remaining = this.brushes.filter((brush) => !movingIds.has(brush.id));
    const next = end === 'first' ? moving.concat(remaining) : remaining.concat(moving);
    return this.replaceListIfOrderChanged(next);
  }

  /**
   * Restores an explicit brush evaluation order (list only).
   *
   * @param orderedBrushIds Full or partial ordered brush id list.
   * @returns True when any brush was reordered.
   */
  applyBrushOrderList(orderedBrushIds: readonly string[]): boolean {
    const reordered = this.buildReorderedList(orderedBrushIds);
    if (reordered.length !== this.brushes.length) return false;
    return this.replaceListIfOrderChanged(reordered);
  }

  /**
   * Attaches a hull preview for a prepared brush instance.
   *
   * @param instance Brush with solid topology.
   */
  private attachHullPreview(instance: SolidBrushInstance): void {
    const hullPreview = SolidBrushVisual.createHullPreview(instance.name, instance.brush, instance.operation);
    instance.attachMesh(hullPreview);
  }

  /**
   * Attaches a box preview using measured or fallback size.
   *
   * @param instance Brush instance.
   * @param previewSize Fallback size when measured size is zero.
   */
  private attachBoxPreview(instance: SolidBrushInstance, previewSize: number): void {
    const measuredSize = this.estimateBrushPreviewSize(instance);
    const size = measuredSize > 1e-6 ? measuredSize : previewSize;
    const boxPreview = SolidBrushVisual.createBoxPreview(instance.name, size, instance.operation);
    instance.attachMesh(boxPreview);
  }

  /**
   * Collects a scene child into ordered brushes when it is an owned brush mesh.
   *
   * @param child Root child.
   * @param ordered Output ordered list.
   * @param remaining Remaining brushes keyed by id.
   */
  private collectBrushChildIfOwned(
    child: THREE.Object3D,
    ordered: SolidBrushInstance[],
    remaining: Map<string, SolidBrushInstance>,
  ): void {
    if (!SolidBrushVisual.isBrushObject(child)) return;
    const brush = this.findBrushByMesh(child);
    if (!brush) return;
    ordered.push(brush);
    remaining.delete(brush.id);
  }

  /**
   * Collects unique brush instances for a reorder operation.
   *
   * @param brushIds Requested brush ids.
   * @returns Moving brushes in request order.
   */
  private collectMovingBrushes(brushIds: readonly string[]): SolidBrushInstance[] {
    const moving: SolidBrushInstance[] = [];
    const movingIds = new Set<string>();
    for (const brushId of brushIds) {
      if (movingIds.has(brushId)) continue;
      const brush = this.findBrush(brushId);
      if (!brush) continue;
      moving.push(brush);
      movingIds.add(brushId);
    }
    return moving;
  }

  /**
   * Builds a reordered list from explicit ids then remaining brushes.
   *
   * @param orderedBrushIds Preferred id order.
   * @returns Candidate evaluation list.
   */
  private buildReorderedList(orderedBrushIds: readonly string[]): SolidBrushInstance[] {
    const idSet = new Set(orderedBrushIds);
    const reordered: SolidBrushInstance[] = [];
    for (const brushId of orderedBrushIds) {
      const brush = this.findBrush(brushId);
      if (brush) reordered.push(brush);
    }
    for (const brush of this.brushes) {
      if (!idSet.has(brush.id)) reordered.push(brush);
    }
    return reordered;
  }

  /**
   * Replaces the brush list and sibling order when evaluation order differs.
   *
   * @param next Candidate ordered list.
   * @returns True when order changed.
   */
  private replaceListIfOrderChanged(next: SolidBrushInstance[]): boolean {
    if (!this.listOrderDiffers(next)) return false;
    this.brushes = next;
    this.applyBrushMeshSiblingOrder();
    return true;
  }

  /**
   * Compares candidate list ids against current evaluation order.
   *
   * @param next Candidate ordered list.
   * @returns True when any position differs.
   */
  private listOrderDiffers(next: SolidBrushInstance[]): boolean {
    for (let index = 0; index < next.length; index++) {
      if (next[index]!.id !== this.brushes[index]!.id) return true;
    }
    return false;
  }
}
