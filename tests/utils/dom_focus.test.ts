import { describe, it, expect, afterEach } from 'vitest';
import { blurActiveFormField, claimDomKeyboardFocus } from '@/utils/dom_focus.js';

describe('blurActiveFormField', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should blur a focused input element', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    blurActiveFormField();
    expect(document.activeElement).not.toBe(input);
  });

  it('should not throw when nothing is focused', () => {
    expect(() => blurActiveFormField()).not.toThrow();
  });

  it('should leave non-form elements alone', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    blurActiveFormField();
    expect(document.activeElement === button || document.activeElement === document.body).toBe(true);
  });
});

describe('claimDomKeyboardFocus', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should steal focus from a focused button onto the target', () => {
    const button = document.createElement('button');
    const canvasHost = document.createElement('div');
    document.body.appendChild(button);
    document.body.appendChild(canvasHost);
    button.focus();
    expect(document.activeElement).toBe(button);
    claimDomKeyboardFocus(canvasHost);
    expect(document.activeElement).toBe(canvasHost);
    expect(canvasHost.tabIndex).toBe(-1);
  });

  it('should keep focus on the target when already focused', () => {
    const canvasHost = document.createElement('div');
    document.body.appendChild(canvasHost);
    claimDomKeyboardFocus(canvasHost);
    claimDomKeyboardFocus(canvasHost);
    expect(document.activeElement).toBe(canvasHost);
  });

  it('should preserve an existing tabindex attribute', () => {
    const canvasHost = document.createElement('div');
    canvasHost.tabIndex = 0;
    document.body.appendChild(canvasHost);
    claimDomKeyboardFocus(canvasHost);
    expect(canvasHost.tabIndex).toBe(0);
    expect(document.activeElement).toBe(canvasHost);
  });
});
