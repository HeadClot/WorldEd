import { describe, it, expect } from 'vitest';
import { calculateExpression } from '../../../src/ai/shared/mcp_calculate.js';

/** Unit tests for the safe MCP arithmetic helper. */
describe('calculateExpression', () => {
  it('evaluates addition and multiplication with parentheses', () => {
    const result = calculateExpression('20+(0.5*12)');
    expect(result.ok).toBe(true);
    expect((result.data as { value: number }).value).toBe(26);
  });

  it('handles unary minus and division', () => {
    const result = calculateExpression('-(4+2)/2');
    expect(result.ok).toBe(true);
    expect((result.data as { value: number }).value).toBe(-3);
  });

  it('rejects division by zero', () => {
    const result = calculateExpression('1/0');
    expect(result.ok).toBe(false);
  });

  it('rejects invalid characters without eval', () => {
    const result = calculateExpression('alert(1)');
    expect(result.ok).toBe(false);
  });

  it('rejects empty expression', () => {
    expect(calculateExpression('   ').ok).toBe(false);
  });
});
