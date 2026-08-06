import { describe, expect, it } from 'vitest';
import { ToolbarIcons } from '@/ui/toolbar/toolbar_icons.js';

describe('ToolbarIcons', () => {
  it('renders documentation as an accessible decorative open-book SVG', () => {
    const icon = ToolbarIcons.documentation();
    const host = document.createElement('div');
    host.innerHTML = icon;
    const svg = host.querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.querySelectorAll('path')).toHaveLength(2);
    expect(icon).toContain('M4 5.5');
  });

  it('renders the official MCP logo mark', () => {
    const icon = ToolbarIcons.mcp();
    const host = document.createElement('div');
    host.innerHTML = icon;
    const svg = host.querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 180 180');
    expect(svg?.querySelectorAll('path')).toHaveLength(3);
    expect(icon).toContain('stroke="currentColor"');
    expect(icon).toContain('M18 84.8528');
  });

  it('renders the settings gear with the original outline and a right-nudged hub', () => {
    const icon = ToolbarIcons.settings();
    const host = document.createElement('div');
    host.innerHTML = icon;
    const svg = host.querySelector('svg');
    const circle = svg?.querySelector('circle');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(icon).toContain('M19.4 13.5v-3');
    expect(circle?.getAttribute('cx')).toBe('13.5');
    expect(circle?.getAttribute('cy')).toBe('12');
    expect(circle?.getAttribute('r')).toBe('3.8');
  });

  it('renders content wireframe and projected grid viewport toggle icons', () => {
    const wire = ToolbarIcons.contentWireframes();
    const grid = ToolbarIcons.projectedGrid();
    expect(wire).toContain('stroke="currentColor"');
    expect(grid).toContain('stroke="currentColor"');
    expect(wire).toContain('M4 7.5');
    expect(grid).toContain('M4 7.5');
  });
});
