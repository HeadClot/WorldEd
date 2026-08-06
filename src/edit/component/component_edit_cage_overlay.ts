import * as THREE from 'three';
import type { ComponentSelectionEntry } from './component_selection_entry.js';
import type { BrushEditCage } from '@/edit/brush/brush_edit_cage.js';
import {
  buildComponentCageDrawBuffers,
  buildComponentSelectionDrawBuffers,
  EDIT_CAGE_COLOR,
  EDIT_SELECTED_EDGE_COLOR,
  type ComponentCageMeshSource,
} from './component_edit_selection_draw.js';

export type { ComponentCageMeshSource };

/** Face fill opacity for the depth-tested front pass. */
const FACE_FRONT_OPACITY = 0.38;

/** Face fill opacity for the occluded (see-through) pass. */
const FACE_OCCLUDED_OPACITY = 0.16;

/** Screen-pixel size for cage vertex dots (in front of wires, black/white). */
export const EDIT_CAGE_VERTEX_POINT_SIZE = 4;

/** Draw order for black cage wires (below selection edges and vertex dots). */
const CAGE_EDGE_RENDER_ORDER = 1000;

/** Draw order for orange selected / half-selected edges. */
const CAGE_SELECTED_EDGE_RENDER_ORDER = 1001;

/**
 * Draw order for vertex dots. Must be above transparent cage wires so selected
 * white verts are not buried under black/orange line fragments.
 */
const CAGE_VERTEX_RENDER_ORDER = 1010;

/**
 * Blender-style Edit Mode cage: one vertex-dot layer (black/white by selection)
 * drawn in front of wires; selected edges orange; faces as dual-pass fills.
 */
export class ComponentEditCageOverlay {
  private readonly scene: THREE.Scene;
  private readonly group: THREE.Group;
  private readonly cagePoints: THREE.Points;
  private readonly cageEdges: THREE.LineSegments;
  private readonly fullSelectedEdges: THREE.LineSegments;
  private readonly halfSelectedEdges: THREE.LineSegments;
  private readonly selectedFaceFront: THREE.Mesh;
  private readonly selectedFaceOccluded: THREE.Mesh;
  private readonly faceFillGeometry: THREE.BufferGeometry;

  /**
   * Creates cage overlays in the scene.
   *
   * @param scene Scene receiving the overlay group.
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'EditComponentCageOverlay';
    this.group.userData['isEditComponentCage'] = true;
    this.cageEdges = this.createLines(EDIT_CAGE_COLOR, 0.9, false, CAGE_EDGE_RENDER_ORDER, true);
    this.fullSelectedEdges = this.createLines(EDIT_SELECTED_EDGE_COLOR, 1, true, CAGE_SELECTED_EDGE_RENDER_ORDER, true);
    this.halfSelectedEdges = this.createLines(EDIT_SELECTED_EDGE_COLOR, 1, true, CAGE_SELECTED_EDGE_RENDER_ORDER, true);
    this.faceFillGeometry = new THREE.BufferGeometry();
    this.faceFillGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    this.selectedFaceOccluded = this.createFaceMesh(
      this.faceFillGeometry,
      FACE_OCCLUDED_OPACITY,
      THREE.GreaterDepth,
      997,
    );
    this.selectedFaceFront = this.createFaceMesh(this.faceFillGeometry, FACE_FRONT_OPACITY, THREE.LessEqualDepth, 998);
    this.cagePoints = this.createVertexPoints(EDIT_CAGE_VERTEX_POINT_SIZE, CAGE_VERTEX_RENDER_ORDER);
    this.group.add(this.cageEdges);
    this.group.add(this.selectedFaceOccluded);
    this.group.add(this.selectedFaceFront);
    this.group.add(this.fullSelectedEdges);
    this.group.add(this.halfSelectedEdges);
    this.group.add(this.cagePoints);
    this.scene.add(this.group);
  }

  /**
   * Rebuilds cage and selection overlays.
   *
   * @param meshSources Content mesh sources.
   * @param brushCages Brush wing-edge cages.
   * @param selected Selected components.
   */
  update(
    meshSources: readonly ComponentCageMeshSource[],
    brushCages: readonly BrushEditCage[],
    selected: readonly ComponentSelectionEntry[],
  ): void {
    const cage = buildComponentCageDrawBuffers(meshSources, brushCages, selected);
    const selection = buildComponentSelectionDrawBuffers(meshSources, brushCages, selected);
    this.replaceColoredPoints(this.cagePoints.geometry, cage.vertexCoords, cage.vertexColors);
    this.replacePositions(this.cageEdges.geometry, cage.edgeCoords);
    this.replaceColoredLines(this.fullSelectedEdges.geometry, selection.fullEdgeCoords, selection.fullEdgeColors);
    this.replaceColoredLines(this.halfSelectedEdges.geometry, selection.halfEdgeCoords, selection.halfEdgeColors);
    this.replaceFaceGeometry(selection.faceCoords);
  }

  /** Removes overlays and disposes GPU resources. */
  dispose(): void {
    this.scene.remove(this.group);
    this.cagePoints.geometry.dispose();
    this.cageEdges.geometry.dispose();
    this.fullSelectedEdges.geometry.dispose();
    this.halfSelectedEdges.geometry.dispose();
    this.faceFillGeometry.dispose();
    (this.cagePoints.material as THREE.Material).dispose();
    (this.cageEdges.material as THREE.Material).dispose();
    (this.fullSelectedEdges.material as THREE.Material).dispose();
    (this.halfSelectedEdges.material as THREE.Material).dispose();
    (this.selectedFaceFront.material as THREE.Material).dispose();
    (this.selectedFaceOccluded.material as THREE.Material).dispose();
  }

  /**
   * Creates the shared vertex-dot cloud (vertex colors for selection). Dots use
   * the transparent pass (opacity 1) so they sort with cage wires and can draw
   * after them via renderOrder — opaque points would paint first and get
   * covered by transparent black/orange edges.
   *
   * @param size CSS-pixel point size.
   * @param renderOrder Draw order above wire edges.
   * @returns Points object.
   */
  private createVertexPoints(size: number, renderOrder: number): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    const material = new THREE.PointsMaterial({
      size,
      sizeAttenuation: false,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      opacity: 1,
      vertexColors: true,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -12,
      polygonOffsetUnits: -12,
    });
    const points = new THREE.Points(geometry, material);
    points.renderOrder = renderOrder;
    points.frustumCulled = false;
    return points;
  }

  /**
   * Creates line segments for cage or selection edges.
   *
   * @param color Base line color.
   * @param opacity Line opacity.
   * @param useVertexColors Whether segment colors come from a color attribute.
   * @param renderOrder Draw order.
   * @param depthTest Whether lines occlude against the mesh.
   * @returns Line segments.
   */
  private createLines(
    color: number,
    opacity: number,
    useVertexColors: boolean,
    renderOrder: number,
    depthTest: boolean,
  ): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    if (useVertexColors) {
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    }
    const material = new THREE.LineBasicMaterial({
      color,
      depthTest,
      depthWrite: false,
      transparent: opacity < 1 || useVertexColors,
      opacity,
      vertexColors: useVertexColors,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = renderOrder;
    lines.frustumCulled = false;
    return lines;
  }

  /**
   * Creates one dual-pass face fill mesh sharing the fill geometry.
   *
   * @param geometry Shared face fill geometry.
   * @param opacity Pass opacity.
   * @param depthFunc Front or occluded depth comparison.
   * @param renderOrder Draw order.
   * @returns Mesh.
   */
  private createFaceMesh(
    geometry: THREE.BufferGeometry,
    opacity: number,
    depthFunc: THREE.DepthModes,
    renderOrder: number,
  ): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({
      color: EDIT_SELECTED_EDGE_COLOR,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: false,
      depthFunc,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;
    return mesh;
  }

  /**
   * Replaces geometry positions.
   *
   * @param geometry Target geometry.
   * @param coords Flat xyz.
   */
  private replacePositions(geometry: THREE.BufferGeometry, coords: number[]): void {
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(coords), 3));
    geometry.computeBoundingSphere();
  }

  /**
   * Replaces vertex positions and per-vertex colors on the cage point cloud.
   *
   * @param geometry Target geometry.
   * @param coords Flat xyz.
   * @param colors Flat rgb 0–1.
   */
  private replaceColoredPoints(geometry: THREE.BufferGeometry, coords: number[], colors: number[]): void {
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(coords), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.computeBoundingSphere();
  }

  /**
   * Replaces colored line segment positions and vertex colors.
   *
   * @param geometry Target geometry.
   * @param coords Flat xyz.
   * @param colors Flat rgb 0–1.
   */
  private replaceColoredLines(geometry: THREE.BufferGeometry, coords: number[], colors: number[]): void {
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(coords), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.computeBoundingSphere();
  }

  /**
   * Replaces shared dual-pass face fill geometry.
   *
   * @param coords Flat triangle xyz list.
   */
  private replaceFaceGeometry(coords: number[]): void {
    this.faceFillGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(coords), 3));
    this.faceFillGeometry.computeBoundingSphere();
  }
}
