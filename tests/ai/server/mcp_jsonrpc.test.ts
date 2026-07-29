import { describe, it, expect } from 'vitest';
import {
  isJsonRpcNotification,
  jsonRpcError,
  jsonRpcSuccess,
  parseJsonRpcRequest,
} from '../../../src/ai/server/mcp_jsonrpc.js';

/** Unit tests for MCP JSON-RPC helpers. */
describe('mcp_jsonrpc', () => {
  it('parses a valid tools/list request', () => {
    const request = parseJsonRpcRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(request).not.toBeNull();
    expect(request?.method).toBe('tools/list');
    expect(request?.id).toBe(1);
  });

  it('rejects bodies without jsonrpc 2.0', () => {
    expect(parseJsonRpcRequest({ method: 'tools/list' })).toBeNull();
  });

  it('detects notifications without id', () => {
    const request = parseJsonRpcRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(request).not.toBeNull();
    expect(isJsonRpcNotification(request!)).toBe(true);
  });

  it('builds success and error envelopes', () => {
    const success = jsonRpcSuccess(7, { ok: true });
    expect(success.result).toEqual({ ok: true });
    const error = jsonRpcError(7, -32601, 'Method not found');
    expect(error.error.code).toBe(-32601);
  });
});
