import type { McpToolResult } from '../shared/mcp_protocol_types.js';
import { findMcpTool } from './mcp_tool_registry.js';

/** Function that runs a named editor tool in the webview. */
export type EditorToolInvoker = (name: string, args: Record<string, unknown>) => Promise<McpToolResult>;

/**
 * Handles MCP tools/call by validating the name and forwarding to the editor.
 *
 * @param params Raw tools/call params.
 * @param invoker Editor tool invoker (usually Electrobun RPC).
 * @returns MCP tools/call result content blocks.
 */
export async function dispatchMcpToolCall(
  params: unknown,
  invoker: EditorToolInvoker,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const parsed = parseToolCallParams(params);
  if (!parsed) {
    return textResult({ ok: false, message: 'Invalid tools/call params' }, true);
  }
  if (!findMcpTool(parsed.name)) {
    return textResult({ ok: false, message: `Unknown tool: ${parsed.name}` }, true);
  }
  const result = await invoker(parsed.name, parsed.arguments);
  return textResult(result, !result.ok);
}

/**
 * Parses tools/call params into name and arguments.
 *
 * @param params Raw params object.
 * @returns Parsed call or null.
 */
function parseToolCallParams(params: unknown): { name: string; arguments: Record<string, unknown> } | null {
  if (!params || typeof params !== 'object') return null;
  const record = params as Record<string, unknown>;
  const name = record['name'];
  if (typeof name !== 'string' || name.length === 0) return null;
  const args = record['arguments'];
  if (args === undefined || args === null) return { name, arguments: {} };
  if (typeof args !== 'object' || Array.isArray(args)) return null;
  return { name, arguments: args as Record<string, unknown> };
}

/**
 * Wraps a tool result as MCP text content.
 *
 * @param result Tool result envelope.
 * @param isError Whether to mark the MCP call as an error.
 * @returns MCP content payload.
 */
function textResult(
  result: McpToolResult,
  isError: boolean,
): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  const payload = {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  };
  if (isError) return { ...payload, isError: true };
  return payload;
}
