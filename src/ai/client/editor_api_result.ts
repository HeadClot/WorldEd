import type { McpImagePayload, McpToolResult } from '@/ai/shared/mcp_protocol_types.js';

/**
 * Builds a successful tool result.
 *
 * @param message Human-readable message.
 * @param data Optional payload.
 * @param extra Optional createdIds / warnings / images.
 * @returns Tool result.
 */
export function okResult(
  message: string,
  data?: unknown,
  extra?: { createdIds?: string[]; warnings?: string[]; images?: McpImagePayload[] },
): McpToolResult {
  const result: McpToolResult = { ok: true, message };
  if (data !== undefined) result.data = data;
  if (extra?.createdIds !== undefined) result.createdIds = extra.createdIds;
  if (extra?.warnings !== undefined) result.warnings = extra.warnings;
  if (extra?.images !== undefined) result.images = extra.images;
  return result;
}

/**
 * Builds a failed tool result.
 *
 * @param message Error message.
 * @returns Tool result.
 */
export function failResult(message: string): McpToolResult {
  return { ok: false, message };
}
