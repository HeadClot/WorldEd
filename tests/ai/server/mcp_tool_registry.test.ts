import { describe, it, expect } from 'vitest';
import { findMcpTool, listMcpTools } from '@/ai/server/registry_mcp_tool.js';
import { dispatchMcpToolCall } from '@/ai/server/mcp_tool_dispatch.js';

/** Unit tests for MCP tool catalog and dispatch. */
describe('mcp_tool_registry', () => {
  it('lists solid-model tools including add_box_brush and rotate_brush', () => {
    const listed = listMcpTools();
    expect(listed.tools.length).toBeGreaterThan(10);
    expect(findMcpTool('add_box_brush')).toBeDefined();
    expect(findMcpTool('get_editor_context')).toBeDefined();
    expect(findMcpTool('rotate_brush')).toBeDefined();
    expect(findMcpTool('clip_brush')).toBeDefined();
    expect(findMcpTool('split_brush')).toBeDefined();
    expect(findMcpTool('set_brush_transform')?.description.toLowerCase()).toContain('rotationdegrees');
    expect(findMcpTool('find_brushes')).toBeDefined();
    expect(findMcpTool('describe_brush')).toBeDefined();
    expect(findMcpTool('align_brush')).toBeDefined();
    expect(findMcpTool('preview_transform')).toBeDefined();
    expect(findMcpTool('add_box_brushes')).toBeDefined();
    expect(findMcpTool('batch_set_brush_transform')).toBeDefined();
    expect(findMcpTool('rename_brush')).toBeDefined();
    expect(findMcpTool('mirror_brushes')).toBeDefined();
    expect(findMcpTool('calculate')).toBeDefined();
    expect(findMcpTool('set_brush_transform')?.description.toLowerCase()).toContain('snap');
    expect(findMcpTool('half_extents')).toBeDefined();
    expect(findMcpTool('preview_new_box')).toBeDefined();
    expect(findMcpTool('explain_csg_at_point')).toBeDefined();
    expect(findMcpTool('query_void_connectivity')).toBeDefined();
    expect(findMcpTool('place_wall')).toBeDefined();
    expect(findMcpTool('add_room_shell')).toBeDefined();
    expect(findMcpTool('cut_opening')).toBeDefined();
    expect(findMcpTool('add_opening')).toBeDefined();
    expect(findMcpTool('reorder_brush_relative')).toBeDefined();
    expect(findMcpTool('create_csg_group')).toBeDefined();
    expect(findMcpTool('set_group_operation')).toBeDefined();
    expect(findMcpTool('ungroup_csg_groups')).toBeDefined();
    expect(findMcpTool('reparent_solid_nodes')).toBeDefined();
    expect(findMcpTool('get_csg_group')).toBeDefined();
    expect(findMcpTool('rename_group')).toBeDefined();
    expect(findMcpTool('get_scene_hierarchy')?.description.toLowerCase()).toContain('csg_group');
    expect(findMcpTool('duplicate_brushes')?.description.toLowerCase()).toContain('group');
    expect(findMcpTool('capture_view')).toBeDefined();
    expect(findMcpTool('capture_view')?.description.toLowerCase()).toContain('picture');
    expect(findMcpTool('capture_view')?.description.toLowerCase()).toContain('jpeg');
  });

  it('dispatches known tools through the invoker', async () => {
    const result = await dispatchMcpToolCall({ name: 'get_editor_context', arguments: {} }, async (name) => ({
      ok: true,
      message: name,
      data: { called: name },
    }));
    expect(result.isError).toBeUndefined();
    const textBlock = result.content[0];
    expect(textBlock?.type).toBe('text');
    if (textBlock?.type !== 'text') {
      throw new Error('expected text content');
    }
    const payload = JSON.parse(textBlock.text) as { ok: boolean; data: { called: string } };
    expect(payload.ok).toBe(true);
    expect(payload.data.called).toBe('get_editor_context');
  });

  it('returns MCP image content blocks without duplicating base64 in text', async () => {
    const result = await dispatchMcpToolCall({ name: 'capture_view', arguments: {} }, async () => ({
      ok: true,
      message: 'Captured view',
      data: { width: 64, height: 64 },
      images: [{ mimeType: 'image/png', data: 'fakebase64payload' }],
    }));
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(2);
    const textBlock = result.content[0];
    const imageBlock = result.content[1];
    expect(textBlock?.type).toBe('text');
    expect(imageBlock?.type).toBe('image');
    if (textBlock?.type !== 'text' || imageBlock?.type !== 'image') {
      throw new Error('expected text + image content');
    }
    expect(textBlock.text).not.toContain('fakebase64payload');
    expect(imageBlock.data).toBe('fakebase64payload');
    expect(imageBlock.mimeType).toBe('image/png');
  });

  it('marks unknown tools as errors', async () => {
    const result = await dispatchMcpToolCall({ name: 'not_a_real_tool', arguments: {} }, async () => ({
      ok: true,
      message: 'should not run',
    }));
    expect(result.isError).toBe(true);
    const errorBlock = result.content[0];
    expect(errorBlock?.type).toBe('text');
    if (errorBlock?.type !== 'text') {
      throw new Error('expected text error content');
    }
    const payload = JSON.parse(errorBlock.text) as { ok: boolean };
    expect(payload.ok).toBe(false);
  });
});
