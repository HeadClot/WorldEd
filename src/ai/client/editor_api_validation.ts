import type { EditorApiHost } from './editor_api_host.js';
import { findBrush, findSolidModel } from './editor_api_lookup.js';
import { computeBrushWorldBounds } from './editor_api_math.js';
import { SolidBrushValidator } from '../../solid/brush/solid_brush_validator.js';
import type { SolidBrushInstance } from '../../solid/model/solid_brush_instance.js';
import type { SolidModel } from '../../solid/model/solid_model.js';
import { SolidOperation } from '../../solid/types/solid_operation.js';
import type { McpToolResult } from '../shared/mcp_protocol_types.js';

/** Validation helpers wrapping SolidBrushValidator and simple CSG warnings. */
export class EditorApiValidation {
  private readonly host: EditorApiHost;

  /**
   * Creates validation helpers.
   *
   * @param host Injected editor systems.
   */
  constructor(host: EditorApiHost) {
    this.host = host;
  }

  /**
   * Validates one brush topology and convexity assumptions.
   *
   * @param brushId Brush id.
   * @returns Tool result with validation payload.
   */
  validateBrush(brushId: string): McpToolResult {
    const found = findBrush(this.host.worldObject, brushId);
    if (!found) return { ok: false, message: `Brush not found: ${brushId}` };
    const result = SolidBrushValidator.validate(found.brush.brush);
    return {
      ok: result.valid,
      message: result.valid ? 'Brush is valid' : 'Brush has validation errors',
      data: { brushId, valid: result.valid, errors: result.errors },
      warnings: result.errors,
    };
  }

  /**
   * Validates all brushes in a solid model and reports simple CSG warnings.
   *
   * @param modelId Solid model root uuid.
   * @returns Tool result with per-brush results and warnings.
   */
  validateSolidModel(modelId: string): McpToolResult {
    const model = findSolidModel(this.host.worldObject, modelId);
    if (!model) return { ok: false, message: `Solid model not found: ${modelId}` };
    const brushes = model.getBrushes();
    const brushResults = brushes.map((brush) => this.validateOneBrush(brush));
    const warnings = this.collectModelWarnings(model, brushes);
    const allValid = brushResults.every((entry) => entry.valid);
    return {
      ok: allValid,
      message: allValid ? 'Solid model brushes are valid' : 'Solid model has validation issues',
      data: { modelId, brushes: brushResults, warnings },
      warnings,
    };
  }

  /**
   * Validates a single brush instance topology.
   *
   * @param brush Brush instance.
   * @returns Per-brush validation row.
   */
  private validateOneBrush(brush: SolidBrushInstance): { brushId: string; valid: boolean; errors: string[] } {
    const result = SolidBrushValidator.validate(brush.brush);
    return { brushId: brush.id, valid: result.valid, errors: result.errors };
  }

  /**
   * Builds non-fatal warnings about CSG order and subtract overlaps.
   *
   * @param model Solid model.
   * @param brushes Ordered brushes.
   * @returns Warning strings.
   */
  private collectModelWarnings(model: SolidModel, brushes: SolidBrushInstance[]): string[] {
    const warnings: string[] = [];
    if (brushes.length === 0) warnings.push('Solid model has no brushes');
    if (model.isInvertedWorld()) {
      warnings.push(
        'invertedWorld is ON: universe starts solid; subtractives dig voids. Leave off for normal additive maps.',
      );
    }
    for (const brush of brushes) {
      if (brush.operation !== SolidOperation.Subtractive) continue;
      if (!this.subtractOverlapsAdditivePeer(model, brush, brushes)) {
        warnings.push(
          `Subtractive "${brush.name}" (${brush.id}) does not overlap any additive brush AABB — cut will have no effect in normal (non-inverted) mode`,
        );
      }
    }
    return warnings;
  }

  /**
   * Returns whether a subtractive brush AABB overlaps an additive peer.
   *
   * @param model Solid model.
   * @param self Subtractive brush.
   * @param brushes All brushes on the model.
   * @returns True when an additive overlap exists.
   */
  private subtractOverlapsAdditivePeer(
    model: SolidModel,
    self: SolidBrushInstance,
    brushes: SolidBrushInstance[],
  ): boolean {
    const selfBox = computeBrushWorldBounds(model, self);
    if (selfBox.isEmpty()) return false;
    for (const peer of brushes) {
      if (peer.id === self.id || peer.operation !== SolidOperation.Additive) continue;
      const peerBox = computeBrushWorldBounds(model, peer);
      if (!peerBox.isEmpty() && peerBox.intersectsBox(selfBox)) return true;
    }
    return false;
  }
}
