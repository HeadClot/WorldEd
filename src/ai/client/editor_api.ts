import type { EditorApiHost } from './editor_api_host.js';
import { EditorApiAlign } from './editor_api_align.js';
import { EditorApiBuilders } from './editor_api_builders.js';
import { EditorApiCsgQuery } from './editor_api_csg_query.js';
import { EditorApiFind } from './editor_api_find.js';
import { EditorApiSolidReads } from './editor_api_solid_reads.js';
import { EditorApiSolidWrites } from './editor_api_solid_writes.js';
import { EditorApiSpatial } from './editor_api_spatial.js';
import { EditorApiValidation } from './editor_api_validation.js';
import type {
  AddBoxBrushArgs,
  AddBoxBrushesArgs,
  AddOpeningArgs,
  AddRoomShellArgs,
  AlignBrushArgs,
  BatchSetBrushTransformArgs,
  ClipBrushArgs,
  CutOpeningArgs,
  DetailArgs,
  DuplicateBrushesArgs,
  ExplainCsgAtPointArgs,
  FindBrushesArgs,
  MeasureArgs,
  MirrorBrushesArgs,
  PlaceWallArgs,
  PreviewNewBoxArgs,
  PreviewTransformArgs,
  QueryNeighborsArgs,
  QueryOverlapsArgs,
  QueryPointArgs,
  QueryVoidConnectivityArgs,
  RenameBrushArgs,
  ReorderBrushRelativeArgs,
  ReorderBrushesArgs,
  RotateBrushArgs,
  SetBrushTransformArgs,
  SplitBrushArgs,
} from './editor_api_types.js';
import { calculateExpression } from '../shared/mcp_calculate.js';
import type { McpToolResult } from '../shared/mcp_protocol_types.js';

/**
 * Facade that external AI tooling uses to inspect and edit solid models. All
 * mutations go through existing undoable commands and controllers.
 */
export class EditorApi {
  private readonly reads: EditorApiSolidReads;
  private readonly writes: EditorApiSolidWrites;
  private readonly spatial: EditorApiSpatial;
  private readonly validation: EditorApiValidation;
  private readonly find: EditorApiFind;
  private readonly align: EditorApiAlign;
  private readonly builders: EditorApiBuilders;
  private readonly csgQuery: EditorApiCsgQuery;

  /**
   * Creates an editor API bound to live editor systems.
   *
   * @param host Injected host dependencies.
   */
  constructor(host: EditorApiHost) {
    this.reads = new EditorApiSolidReads(host);
    this.writes = new EditorApiSolidWrites(host);
    this.spatial = new EditorApiSpatial(host);
    this.validation = new EditorApiValidation(host);
    this.find = new EditorApiFind(host);
    this.align = new EditorApiAlign(host);
    this.builders = new EditorApiBuilders(host, this.writes);
    this.csgQuery = new EditorApiCsgQuery(host);
  }

  /**
   * Dispatches a tool by name with a plain argument object.
   *
   * @param name MCP tool name.
   * @param args Tool arguments.
   * @returns Tool result envelope.
   */
  invokeTool(name: string, args: Record<string, unknown> = {}): McpToolResult {
    try {
      return this.dispatch(name, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `Tool failed: ${message}` };
    }
  }

  /**
   * Routes a tool name to the matching EditorApi method.
   *
   * @param name Tool name.
   * @param args Argument object.
   * @returns Tool result.
   */
  private dispatch(name: string, args: Record<string, unknown>): McpToolResult {
    switch (name) {
      case 'get_editor_context':
        return this.reads.getEditorContext();
      case 'get_snap_settings':
        return this.reads.getSnapSettings();
      case 'list_solid_models':
        return this.reads.listSolidModels();
      case 'get_solid_model':
        return this.reads.getSolidModel(stringArg(args, 'modelId'));
      case 'get_brush':
        return this.reads.getBrush(stringArg(args, 'brushId'), detailArg(args));
      case 'get_scene_hierarchy':
        return this.reads.getSceneHierarchy();
      case 'get_selection':
        return this.reads.getSelection();
      case 'find_brushes':
        return this.find.findBrushes(args as unknown as FindBrushesArgs);
      case 'describe_brush':
        return this.find.describeBrush(stringArg(args, 'brushId'));
      case 'half_extents':
        return this.spatial.halfExtents(stringArg(args, 'brushId'));
      case 'query_brush_bounds':
        return this.spatial.queryBrushBounds(optionalString(args, 'modelId'), optionalString(args, 'brushId'));
      case 'query_overlaps':
        return this.spatial.queryOverlaps(args as unknown as QueryOverlapsArgs);
      case 'query_point':
        return this.spatial.queryPoint(args as unknown as QueryPointArgs);
      case 'query_neighbors':
        return this.spatial.queryNeighbors(args as unknown as QueryNeighborsArgs);
      case 'measure':
        return this.spatial.measure(args as unknown as MeasureArgs);
      case 'preview_transform':
        return this.align.previewTransform(args as unknown as PreviewTransformArgs);
      case 'preview_new_box':
        return this.builders.previewNewBox(args as unknown as PreviewNewBoxArgs);
      case 'explain_csg_at_point':
        return this.csgQuery.explainCsgAtPoint(args as unknown as ExplainCsgAtPointArgs);
      case 'query_void_connectivity':
        return this.csgQuery.queryVoidConnectivity(args as unknown as QueryVoidConnectivityArgs);
      case 'validate_brush':
        return this.validation.validateBrush(stringArg(args, 'brushId'));
      case 'validate_solid_model':
        return this.validation.validateSolidModel(stringArg(args, 'modelId'));
      case 'create_solid_model':
        return this.writes.createSolidModel(optionalString(args, 'name'));
      case 'add_box_brush':
        return this.writes.addBoxBrush(args as unknown as AddBoxBrushArgs);
      case 'add_box_brushes':
        return this.writes.addBoxBrushes(args as unknown as AddBoxBrushesArgs);
      case 'place_wall':
        return this.builders.placeWall(args as unknown as PlaceWallArgs);
      case 'add_room_shell':
        return this.builders.addRoomShell(args as unknown as AddRoomShellArgs);
      case 'cut_opening':
        return this.builders.cutOpening(args as unknown as CutOpeningArgs);
      case 'add_opening':
        return this.builders.addOpening(args as unknown as AddOpeningArgs);
      case 'set_brush_operation':
        return this.writes.setBrushOperation(stringArrayArg(args, 'brushIds'), stringArg(args, 'operation'));
      case 'set_brush_transform':
        return this.writes.setBrushTransform(args as unknown as SetBrushTransformArgs);
      case 'batch_set_brush_transform':
        return this.writes.batchSetBrushTransform(args as unknown as BatchSetBrushTransformArgs);
      case 'align_brush':
        return this.align.alignBrush(args as unknown as AlignBrushArgs);
      case 'rotate_brush':
        return this.writes.rotateBrush(args as unknown as RotateBrushArgs);
      case 'rename_brush':
        return this.writes.renameBrush(args as unknown as RenameBrushArgs);
      case 'clip_brush':
        return this.writes.clipBrush(args as unknown as ClipBrushArgs);
      case 'split_brush':
        return this.writes.splitBrush(args as unknown as SplitBrushArgs);
      case 'delete_brushes':
        return this.writes.deleteBrushes(stringArrayArg(args, 'brushIds'));
      case 'duplicate_brushes':
        return this.writes.duplicateBrushes(normalizeDuplicateArgs(args));
      case 'mirror_brushes':
        return this.writes.mirrorBrushes(args as unknown as MirrorBrushesArgs);
      case 'reorder_brushes':
        return this.writes.reorderBrushes(args as unknown as ReorderBrushesArgs);
      case 'reorder_brush_relative':
        return this.writes.reorderBrushRelative(args as unknown as ReorderBrushRelativeArgs);
      case 'set_inverted_world':
        return this.writes.setInvertedWorld(stringArg(args, 'modelId'), Boolean(args['inverted']));
      case 'select':
        return this.writes.selectBrushes(stringArrayArg(args, 'brushIds'));
      case 'undo':
        return this.writes.undo();
      case 'redo':
        return this.writes.redo();
      case 'calculate':
        return calculateExpression(stringArg(args, 'expression'));
      default:
        return { ok: false, message: `Unknown tool: ${name}` };
    }
  }
}

/**
 * Normalizes duplicate_brushes args (supports legacy brushIds-only shape).
 *
 * @param args Raw tool args.
 * @returns Typed duplicate args.
 */
function normalizeDuplicateArgs(args: Record<string, unknown>): DuplicateBrushesArgs {
  const result: DuplicateBrushesArgs = {
    brushIds: stringArrayArg(args, 'brushIds'),
  };
  const offset = args['offset'];
  if (offset && typeof offset === 'object' && !Array.isArray(offset)) {
    result.offset = offset as { x: number; y: number; z: number };
  }
  const mirrorAxis = args['mirrorAxis'];
  if (mirrorAxis === 'x' || mirrorAxis === 'z') result.mirrorAxis = mirrorAxis;
  const mirrorPlane = args['mirrorPlane'];
  if (typeof mirrorPlane === 'number') result.mirrorPlane = mirrorPlane;
  if (typeof args['snap'] === 'boolean') result.snap = args['snap'];
  if (typeof args['exact'] === 'boolean') result.exact = args['exact'];
  return result;
}

/**
 * Reads a required string argument.
 *
 * @param args Argument object.
 * @param key Argument key.
 * @returns String value.
 */
function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing string argument: ${key}`);
  }
  return value;
}

/**
 * Reads an optional string argument.
 *
 * @param args Argument object.
 * @param key Argument key.
 * @returns String or undefined.
 */
function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Reads a string array argument (accepts single string).
 *
 * @param args Argument object.
 * @param key Argument key.
 * @returns String array.
 */
function stringArrayArg(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (typeof value === 'string' && value.length > 0) return [value];
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  throw new Error(`Missing string array argument: ${key}`);
}

/**
 * Reads detail level from args, defaulting to summary.
 *
 * @param args Argument object including optional detail.
 * @returns Detail level.
 */
function detailArg(args: Record<string, unknown> & DetailArgs): 'summary' | 'full' {
  return args.detail === 'full' ? 'full' : 'summary';
}
