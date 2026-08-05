import { Theme } from '@/theme.js';
import {
  INPUT_NUMERIC_MIXED_VALUE_DISPLAY,
  inputNumericFormatDisplayValue,
  inputNumericFormatSharedValues,
  inputNumericNumberOrNull,
  inputNumericParseOptionalNumber,
  type InputNumericParseResult,
} from './input_numeric_parse.js';

/** Optional layout and chrome overrides for a numeric field. */
export interface InputNumericOptions {
  /** HTML step attribute as a number stored in dataset for future nudge use. */
  step?: number;
  /** CSS width (e.g. "100%" or "48px"). */
  width?: string;
  /** CSS min-width. */
  minWidth?: string;
  /** CSS max-width. */
  maxWidth?: string;
  /** CSS height. */
  height?: string;
  /** CSS padding. */
  padding?: string;
  /** CSS border-radius. */
  borderRadius?: string;
  /** CSS text-align. */
  textAlign?: string;
  /** CSS font-size. */
  fontSize?: string;
  /** Accessible name. */
  ariaLabel?: string;
}

/**
 * Shared numeric text field used by inspectors, the UV editor, and similar
 * panels. Accepts plain numbers and arithmetic expressions through the same
 * safe parser, and supports multi-select mixed-value display.
 */
export class InputNumeric {
  private readonly element: HTMLInputElement;
  private readonly focusHandler: () => void;
  private readonly boundCommitHandlers: Array<(event: Event) => void> = [];
  private isDisposed = false;

  /**
   * Creates a themed numeric input element.
   *
   * @param options Optional layout overrides.
   */
  constructor(options: InputNumericOptions = {}) {
    this.element = document.createElement('input');
    this.focusHandler = () => this.clearMixedValueOnFocus();
    this.configureElementDefaults();
    this.applyOptions(options);
    this.element.addEventListener('focus', this.focusHandler);
  }

  /**
   * Returns the underlying input element for layout attachment.
   *
   * @returns Input DOM node.
   */
  getElement(): HTMLInputElement {
    return this.element;
  }

  /**
   * Returns the current raw text in the field.
   *
   * @returns Input value.
   */
  getText(): string {
    return this.element.value;
  }

  /**
   * Replaces the field text without parsing.
   *
   * @param text Display text.
   */
  setText(text: string): void {
    this.element.value = text;
  }

  /**
   * Writes a shared number or the mixed-value placeholder.
   *
   * @param value Shared value or null when mixed.
   * @param decimals Fixed decimal places.
   */
  setNumber(value: number | null, decimals: number): void {
    this.element.value = inputNumericFormatDisplayValue(value, decimals);
  }

  /**
   * Writes multi-select values as a shared number or mixed dash.
   *
   * @param values Per-object values for this field.
   * @param decimals Decimal places when shared.
   */
  setSharedValues(values: readonly number[], decimals: number): void {
    this.element.value = inputNumericFormatSharedValues(values, decimals);
  }

  /**
   * Parses the field as a number or arithmetic expression.
   *
   * @returns Value, skip, or invalid.
   */
  parse(): InputNumericParseResult {
    return inputNumericParseOptionalNumber(this.element.value);
  }

  /**
   * Returns a finite number when the field parses to a value, otherwise null.
   * Skip and invalid both yield null so partial multi-select commits leave the
   * axis unchanged.
   *
   * @returns Parsed number or null.
   */
  parseNumberOrNull(): number | null {
    return inputNumericNumberOrNull(this.parse());
  }

  /**
   * Binds commit handlers for change, and Enter which blurs so change fires
   * once without a double apply.
   *
   * @param onCommit Called when the user commits the field.
   */
  bindCommit(onCommit: () => void): void {
    const handleChange = () => {
      if (this.isDisposed) {
        return;
      }
      onCommit();
    };
    const handleKeyDown = (event: Event) => {
      if (this.isDisposed) {
        return;
      }
      this.handleEnterBlur(event as KeyboardEvent);
    };
    this.element.addEventListener('change', handleChange);
    this.element.addEventListener('keydown', handleKeyDown);
    this.boundCommitHandlers.push(handleChange, handleKeyDown);
  }

  /** Removes focus and commit listeners. Safe to call more than once. */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.element.removeEventListener('focus', this.focusHandler);
    for (const handler of this.boundCommitHandlers) {
      this.element.removeEventListener('change', handler);
      this.element.removeEventListener('keydown', handler);
    }
    this.boundCommitHandlers.length = 0;
  }

  /**
   * Applies default type, theme colors, and monospace chrome shared by all
   * numeric fields.
   */
  private configureElementDefaults(): void {
    this.element.type = 'text';
    this.element.inputMode = 'decimal';
    this.element.placeholder = INPUT_NUMERIC_MIXED_VALUE_DISPLAY;
    this.element.style.boxSizing = 'border-box';
    this.element.style.background = Theme.inputBackgroundColor;
    this.element.style.color = Theme.inputTextColor;
    this.element.style.border = `1px solid ${Theme.inputBorderColor}`;
    this.element.style.borderRadius = '2px';
    this.element.style.padding = '2px 4px';
    this.element.style.fontSize = '11px';
    this.element.style.fontFamily = 'monospace';
  }

  /**
   * Applies constructor layout options onto the element.
   *
   * @param options Layout overrides.
   */
  private applyOptions(options: InputNumericOptions): void {
    this.applyStepOption(options.step);
    this.applyWidthOptions(options);
    this.applyChromeOptions(options);
    if (options.ariaLabel) {
      this.element.setAttribute('aria-label', options.ariaLabel);
    }
  }

  /**
   * Stores step size for consumers that nudge from dataset.
   *
   * @param step Optional step size.
   */
  private applyStepOption(step: number | undefined): void {
    if (step === undefined) {
      return;
    }
    this.element.dataset['step'] = String(step);
  }

  /**
   * Applies width-related layout options.
   *
   * @param options Layout overrides.
   */
  private applyWidthOptions(options: InputNumericOptions): void {
    if (options.width !== undefined) {
      this.element.style.width = options.width;
    }
    if (options.minWidth !== undefined) {
      this.element.style.minWidth = options.minWidth;
    }
    if (options.maxWidth !== undefined) {
      this.element.style.maxWidth = options.maxWidth;
    }
    if (options.height !== undefined) {
      this.element.style.height = options.height;
    }
  }

  /**
   * Applies padding, radius, alignment, and font overrides.
   *
   * @param options Layout overrides.
   */
  private applyChromeOptions(options: InputNumericOptions): void {
    if (options.padding !== undefined) {
      this.element.style.padding = options.padding;
    }
    if (options.borderRadius !== undefined) {
      this.element.style.borderRadius = options.borderRadius;
    }
    if (options.textAlign !== undefined) {
      this.element.style.textAlign = options.textAlign;
    }
    if (options.fontSize !== undefined) {
      this.element.style.fontSize = options.fontSize;
    }
  }

  /** Clears a mixed-value dash on focus so typing replaces it. */
  private clearMixedValueOnFocus(): void {
    if (this.element.value.trim() !== INPUT_NUMERIC_MIXED_VALUE_DISPLAY) {
      return;
    }
    this.element.value = '';
  }

  /**
   * Blurs the field on Enter so the change event performs a single commit.
   *
   * @param event Keyboard event.
   */
  private handleEnterBlur(event: KeyboardEvent): void {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    this.element.blur();
  }
}
