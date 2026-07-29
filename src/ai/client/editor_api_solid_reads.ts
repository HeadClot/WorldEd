import type * as THREE from 'three';
import type { EditorApiHost } from './editor_api_host.js';
import type {
  EditorContextDto,
  HierarchyNodeDto,
  SelectionSummaryDto,
  SnapSettingsDto,
  SolidBrushDetailDto,
  SolidBrushSummaryDto,
  SolidModelDetailDto,
  SolidModelSummaryDto,
} from './editor_api_types.js';
import { boxToDto, computeBrushWorldBounds, computeModelWorldBounds, vec3ToDto } from './editor_api_math.js';
import { eulerToDegreesDto } from './editor_api_snap.js';
import { findBrush, findSolidModel, listSolidModels } from './editor_api_lookup.js';
import { solidOperationToName } from './editor_api_operations.js';
import { APPLICATION_DISPLAY_NAME, APPLICATION_VERSION } from '../../application_identity.js';
import { SolidModel } from '../../solid/model/solid_model.js';
import { SolidBrushVisual } from '../../solid/model/solid_brush_visual.js';
import type { SolidBrushInstance } from '../../solid/model/solid_brush_instance.js';
import type { McpDetailLevel, McpToolResult } from '../shared/mcp_protocol_types.js';

/** Read-only solid model queries for EditorApi. */
export class EditorApiSolidReads {
  private readonly host: EditorApiHost;

  /**
   * Creates solid read helpers.
   *
   * @param host Injected editor systems.
   */
  constructor(host: EditorApiHost) {
    this.host = host;
  }

  /**
   * Returns editor context for AI planning.
   *
   * @returns Tool result with context DTO.
   */
  getEditorContext(): McpToolResult {
    const data: EditorContextDto = {
      applicationName: APPLICATION_DISPLAY_NAME,
      version: APPLICATION_VERSION,
      coordinateSystem: 'threejs',
      handedness: 'right',
      upAxis: 'y',
      snap: this.getSnapSettingsDto(),
      undoCount: this.host.commandStack.getUndoCount(),
      redoCount: this.host.commandStack.getRedoCount(),
      solidModelCount: listSolidModels(this.host.worldObject).length,
      selection: this.buildSelectionSummary(),
    };
    return okResult('Editor context', data);
  }

  /**
   * Returns live snap settings.
   *
   * @returns Tool result with snap DTO.
   */
  getSnapSettings(): McpToolResult {
    return okResult('Snap settings', this.getSnapSettingsDto());
  }

  /**
   * Lists solid models under the world.
   *
   * @returns Tool result with model summaries.
   */
  listSolidModels(): McpToolResult {
    const models = listSolidModels(this.host.worldObject).map((model) => this.toModelSummary(model));
    return okResult(`Found ${models.length} solid model(s)`, { models });
  }

  /**
   * Returns one solid model with ordered brushes.
   *
   * @param modelId Solid model root uuid.
   * @returns Tool result with model detail.
   */
  getSolidModel(modelId: string): McpToolResult {
    const model = findSolidModel(this.host.worldObject, modelId);
    if (!model) return failResult(`Solid model not found: ${modelId}`);
    return okResult('Solid model', this.toModelDetail(model));
  }

  /**
   * Returns one brush, optionally with geometry.
   *
   * @param brushId Brush id.
   * @param detail Summary or full geometry.
   * @returns Tool result with brush detail.
   */
  getBrush(brushId: string, detail: McpDetailLevel = 'summary'): McpToolResult {
    const found = findBrush(this.host.worldObject, brushId);
    if (!found) return failResult(`Brush not found: ${brushId}`);
    const orderIndex = found.model.getBrushes().findIndex((entry) => entry.id === brushId);
    const dto = this.toBrushDetail(found.model, found.brush, orderIndex, detail);
    return okResult('Brush', dto);
  }

  /**
   * Returns a shallow hierarchy of solid models and brushes.
   *
   * @returns Tool result with hierarchy nodes.
   */
  getSceneHierarchy(): McpToolResult {
    const children = listSolidModels(this.host.worldObject).map((model) => this.toHierarchyNode(model));
    return okResult('Scene hierarchy', { children });
  }

  /**
   * Returns the current selection as solid ids.
   *
   * @returns Tool result with selection summary.
   */
  getSelection(): McpToolResult {
    return okResult('Selection', this.buildSelectionSummary());
  }

  /**
   * Builds snap settings from host systems.
   *
   * @returns Snap DTO.
   */
  private getSnapSettingsDto(): SnapSettingsDto {
    return {
      enabled: this.host.getUserSnapEnabled(),
      interval: this.host.snapManager.getInterval(),
      rotationSnapDegrees: this.host.gridSnap.getRotationSnapDegrees(),
      scaleSnapInterval: this.host.gridSnap.getScaleSnapInterval(),
    };
  }

  /**
   * Builds selection summary from selected meshes.
   *
   * @returns Selection DTO.
   */
  private buildSelectionSummary(): SelectionSummaryDto {
    const brushIds: string[] = [];
    const solidModelIds = new Set<string>();
    const selected = Array.from(this.host.selectionManager.getSelectedObjects());
    for (const mesh of selected) {
      this.collectSelectionIds(mesh, brushIds, solidModelIds);
    }
    return {
      brushIds,
      solidModelIds: Array.from(solidModelIds),
      meshCount: selected.length,
    };
  }

  /**
   * Collects brush and solid model ids for one selected mesh.
   *
   * @param mesh Selected mesh.
   * @param brushIds Accumulator for brush ids.
   * @param solidModelIds Accumulator for model ids.
   */
  private collectSelectionIds(mesh: THREE.Mesh, brushIds: string[], solidModelIds: Set<string>): void {
    const model = SolidModel.fromObject(mesh);
    if (!model) return;
    solidModelIds.add(model.root.uuid);
    if (!SolidBrushVisual.isBrushObject(mesh)) return;
    const brush = model.findBrushByMesh(mesh);
    if (brush) brushIds.push(brush.id);
  }

  /**
   * Maps a solid model to a summary DTO.
   *
   * @param model Solid model.
   * @returns Summary DTO.
   */
  private toModelSummary(model: SolidModel): SolidModelSummaryDto {
    return {
      modelId: model.root.uuid,
      name: model.root.name,
      brushCount: model.getBrushCount(),
      invertedWorld: model.isInvertedWorld(),
      worldBounds: boxToDto(computeModelWorldBounds(model)),
    };
  }

  /**
   * Maps a solid model to a detail DTO with ordered brushes.
   *
   * @param model Solid model.
   * @returns Detail DTO.
   */
  private toModelDetail(model: SolidModel): SolidModelDetailDto {
    const brushes = model.getBrushes().map((brush, orderIndex) => this.toBrushSummary(model, brush, orderIndex));
    return { ...this.toModelSummary(model), brushes };
  }

  /**
   * Maps a brush to a summary DTO.
   *
   * @param model Owning model.
   * @param brush Brush instance.
   * @param orderIndex CSG evaluation index.
   * @returns Summary DTO.
   */
  private toBrushSummary(model: SolidModel, brush: SolidBrushInstance, orderIndex: number): SolidBrushSummaryDto {
    brush.pullTransformFromMesh();
    return {
      brushId: brush.id,
      name: brush.name,
      operation: solidOperationToName(brush.operation),
      orderIndex,
      visible: brush.visible,
      position: vec3ToDto(brush.position),
      rotationDegrees: eulerToDegreesDto(brush.rotation),
      scale: vec3ToDto(brush.scale),
      localBounds: boxToDto(brush.brush.computeLocalBounds()),
      worldBounds: boxToDto(computeBrushWorldBounds(model, brush)),
    };
  }

  /**
   * Maps a brush to a detail DTO.
   *
   * @param model Owning model.
   * @param brush Brush instance.
   * @param orderIndex CSG evaluation index.
   * @param detail Summary or full geometry.
   * @returns Detail DTO.
   */
  private toBrushDetail(
    model: SolidModel,
    brush: SolidBrushInstance,
    orderIndex: number,
    detail: McpDetailLevel,
  ): SolidBrushDetailDto {
    const summary = this.toBrushSummary(model, brush, orderIndex);
    if (detail !== 'full') return { ...summary, modelId: model.root.uuid };
    return {
      ...summary,
      modelId: model.root.uuid,
      geometry: {
        vertices: brush.brush.vertices.map((vertex) => vec3ToDto(vertex)),
        faceCount: brush.brush.faces.length,
        planes: brush.brush.planes.map((plane) => ({
          normal: vec3ToDto(plane.normal),
          distance: plane.offset,
        })),
      },
    };
  }

  /**
   * Builds a hierarchy node for a solid model and its brushes.
   *
   * @param model Solid model.
   * @returns Hierarchy node.
   */
  private toHierarchyNode(model: SolidModel): HierarchyNodeDto {
    const children = model.getBrushes().map((brush) => ({
      id: brush.id,
      name: brush.name,
      kind: 'brush' as const,
      children: [],
    }));
    return {
      id: model.root.uuid,
      name: model.root.name,
      kind: 'solid_model',
      children,
    };
  }
}

/**
 * Builds a successful tool result.
 *
 * @param message Human-readable message.
 * @param data Optional payload.
 * @returns Tool result.
 */
function okResult(message: string, data?: unknown): McpToolResult {
  return { ok: true, message, data };
}

/**
 * Builds a failed tool result.
 *
 * @param message Error message.
 * @returns Tool result.
 */
function failResult(message: string): McpToolResult {
  return { ok: false, message };
}
