import { describe, expect, it } from 'vitest';
import { ToolbarIcons } from '../../src/ui/toolbar_icons.js';

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
});
