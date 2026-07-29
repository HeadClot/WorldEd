import { describe, it, expect } from 'vitest';
import { findMcpTool, listMcpTools } from '../../../src/ai/server/mcp_tool_registry.js';
import { dispatchMcpToolCall } from '../../../src/ai/server/mcp_tool_dispatch.js';

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
  });

  it('dispatches known tools through the invoker', async () => {
    const result = await dispatchMcpToolCall({ name: 'get_editor_context', arguments: {} }, async (name) => ({
      ok: true,
      message: name,
      data: { called: name },
    }));
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text) as { ok: boolean; data: { called: string } };
    expect(payload.ok).toBe(true);
    expect(payload.data.called).toBe('get_editor_context');
  });

  it('marks unknown tools as errors', async () => {
    const result = await dispatchMcpToolCall({ name: 'not_a_real_tool', arguments: {} }, async () => ({
      ok: true,
      message: 'should not run',
    }));
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text) as { ok: boolean };
    expect(payload.ok).toBe(false);
  });
});
