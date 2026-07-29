import type { McpToolResult } from './mcp_protocol_types.js';

/**
 * Evaluates a simple arithmetic expression safely (no eval). Supports + - * /
 * parentheses and decimals, e.g. "20+(0.5*12)".
 *
 * @param expression User expression string.
 * @returns Tool result with numeric value.
 */
export function calculateExpression(expression: string): McpToolResult {
  const trimmed = expression.trim();
  if (!trimmed) return { ok: false, message: 'expression is empty' };
  if (trimmed.length > 200) return { ok: false, message: 'expression is too long (max 200 chars)' };
  try {
    return evaluateTrimmedExpression(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Invalid expression: ${message}` };
  }
}

/**
 * Parses and evaluates a non-empty trimmed expression.
 *
 * @param expression Trimmed expression text.
 * @returns Successful tool result.
 */
function evaluateTrimmedExpression(expression: string): McpToolResult {
  const parser = new ArithmeticParser(expression);
  const value = parser.parseExpression();
  parser.expectEnd();
  if (!Number.isFinite(value)) return { ok: false, message: 'result is not a finite number' };
  return { ok: true, message: 'Calculated', data: { expression, value } };
}

/** Recursive-descent parser for + - * / and parentheses only. */
class ArithmeticParser {
  private readonly source: string;
  private index: number;

  /**
   * Creates a parser over a source string.
   *
   * @param source Expression text.
   */
  constructor(source: string) {
    this.source = source;
    this.index = 0;
  }

  /**
   * Parses an additive expression.
   *
   * @returns Numeric value.
   */
  parseExpression(): number {
    let value = this.parseTerm();
    while (this.match('+') || this.match('-')) {
      const operator = this.source[this.index - 1]!;
      const right = this.parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  /**
   * Parses a multiplicative term.
   *
   * @returns Numeric value.
   */
  private parseTerm(): number {
    let value = this.parseUnary();
    while (this.match('*') || this.match('/')) {
      const operator = this.source[this.index - 1]!;
      const right = this.parseUnary();
      if (operator === '/' && right === 0) throw new Error('division by zero');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  }

  /**
   * Parses unary plus/minus and primary values.
   *
   * @returns Numeric value.
   */
  private parseUnary(): number {
    if (this.match('+')) return this.parseUnary();
    if (this.match('-')) return -this.parseUnary();
    return this.parsePrimary();
  }

  /**
   * Parses a number or parenthesized expression.
   *
   * @returns Numeric value.
   */
  private parsePrimary(): number {
    this.skipWhitespace();
    if (this.match('(')) {
      const value = this.parseExpression();
      if (!this.match(')')) throw new Error('missing closing parenthesis');
      return value;
    }
    return this.parseNumber();
  }

  /**
   * Parses a decimal number at the current index.
   *
   * @returns Numeric value.
   */
  private parseNumber(): number {
    this.skipWhitespace();
    const start = this.index;
    while (this.index < this.source.length && isDigit(this.source[this.index]!)) this.index += 1;
    if (this.source[this.index] === '.') {
      this.index += 1;
      while (this.index < this.source.length && isDigit(this.source[this.index]!)) this.index += 1;
    }
    if (this.index === start) throw new Error(`expected number at position ${this.index}`);
    const text = this.source.slice(start, this.index);
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error(`invalid number "${text}"`);
    return value;
  }

  /** Ensures no trailing non-whitespace remains. */
  expectEnd(): void {
    this.skipWhitespace();
    if (this.index < this.source.length) {
      throw new Error(`unexpected character "${this.source[this.index]}" at position ${this.index}`);
    }
  }

  /**
   * Consumes an operator character when present.
   *
   * @param character Expected character.
   * @returns True when consumed.
   */
  private match(character: string): boolean {
    this.skipWhitespace();
    if (this.source[this.index] !== character) return false;
    this.index += 1;
    return true;
  }

  /** Advances past ASCII whitespace. */
  private skipWhitespace(): void {
    while (this.index < this.source.length && isWhitespace(this.source[this.index]!)) {
      this.index += 1;
    }
  }
}

/**
 * Returns whether a character is an ASCII digit.
 *
 * @param character Single character.
 * @returns True for 0-9.
 */
function isDigit(character: string): boolean {
  return character >= '0' && character <= '9';
}

/**
 * Returns whether a character is ASCII whitespace.
 *
 * @param character Single character.
 * @returns True for space/tab/newline.
 */
function isWhitespace(character: string): boolean {
  return character === ' ' || character === '\t' || character === '\n' || character === '\r';
}
