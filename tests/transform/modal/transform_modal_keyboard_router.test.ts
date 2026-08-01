import { describe, it, expect } from 'vitest';
import { transformModalKeyboardRoute } from '@/transform/modal/transform_modal_keyboard_router.js';
import { TransformModalKeyboardAction } from '@/transform/modal/transform_modal_keyboard_action.js';

/**
 * Builds a keyboard event for router tests.
 *
 * @param init Event init fields.
 * @returns KeyboardEvent.
 */
function keyEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init);
}

describe('transformModalKeyboardRoute minus / sign', () => {
  it('routes main-row Minus and NumpadSubtract to toggle sign', () => {
    expect(transformModalKeyboardRoute(keyEvent({ code: 'Minus', key: '-' }))).toEqual({
      action: TransformModalKeyboardAction.ToggleSign,
    });
    expect(transformModalKeyboardRoute(keyEvent({ code: 'NumpadSubtract', key: '-' }))).toEqual({
      action: TransformModalKeyboardAction.ToggleSign,
    });
  });

  it('routes main-row hyphen by produced key even when code is empty', () => {
    expect(transformModalKeyboardRoute(keyEvent({ code: '', key: '-' }))).toEqual({
      action: TransformModalKeyboardAction.ToggleSign,
    });
  });

  it('routes physical Minus when Shift produces underscore', () => {
    expect(transformModalKeyboardRoute(keyEvent({ code: 'Minus', key: '_', shiftKey: true }))).toEqual({
      action: TransformModalKeyboardAction.ToggleSign,
    });
  });

  it('routes unicode minus key characters', () => {
    expect(transformModalKeyboardRoute(keyEvent({ code: '', key: '−' }))).toEqual({
      action: TransformModalKeyboardAction.ToggleSign,
    });
  });

  it('still routes digits and decimal independently of sign', () => {
    expect(transformModalKeyboardRoute(keyEvent({ code: 'Digit5', key: '5' }))).toEqual({
      action: TransformModalKeyboardAction.AppendDigit,
      digit: '5',
    });
    expect(transformModalKeyboardRoute(keyEvent({ code: 'Period', key: '.' }))).toEqual({
      action: TransformModalKeyboardAction.AppendDecimal,
    });
  });
});
