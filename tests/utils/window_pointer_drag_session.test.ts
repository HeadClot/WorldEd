import { describe, it, expect, afterEach, vi } from 'vitest';
import { WindowPointerDragSession } from '../../src/utils/window_pointer_drag_session.js';

describe('WindowPointerDragSession', () => {
  let session: WindowPointerDragSession;

  afterEach(() => {
    session?.end();
  });

  it('should invoke move and up callbacks from window events', () => {
    session = new WindowPointerDragSession();
    const onMove = vi.fn();
    const onUp = vi.fn();
    session.begin(onMove, onUp);
    expect(session.isActive()).toBe(true);
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 10 }));
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onUp).toHaveBeenCalledTimes(1);
    expect(session.isActive()).toBe(false);
  });

  it('should end the drag on pointercancel without requiring canvas events', () => {
    session = new WindowPointerDragSession();
    const onUp = vi.fn();
    session.begin(() => undefined, onUp);
    window.dispatchEvent(new PointerEvent('pointercancel'));
    expect(onUp).toHaveBeenCalledTimes(1);
    expect(session.isActive()).toBe(false);
  });

  it('should stop delivering events after end is called', () => {
    session = new WindowPointerDragSession();
    const onMove = vi.fn();
    const onUp = vi.fn();
    session.begin(onMove, onUp);
    session.end();
    window.dispatchEvent(new PointerEvent('pointermove'));
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(onMove).not.toHaveBeenCalled();
    expect(onUp).not.toHaveBeenCalled();
    expect(session.isActive()).toBe(false);
  });

  it('should replace a previous capture when begin is called again', () => {
    session = new WindowPointerDragSession();
    const firstUp = vi.fn();
    const secondUp = vi.fn();
    session.begin(() => undefined, firstUp);
    session.begin(() => undefined, secondUp);
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(firstUp).not.toHaveBeenCalled();
    expect(secondUp).toHaveBeenCalledTimes(1);
  });

  it('should attach listeners to a custom target window for detached popups', () => {
    session = new WindowPointerDragSession();
    const onMove = vi.fn();
    const onUp = vi.fn();
    const targetWindow = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    session.begin(onMove, onUp, targetWindow);
    expect(targetWindow.addEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(targetWindow.addEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(targetWindow.addEventListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
    session.end();
    expect(targetWindow.removeEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
  });
});
