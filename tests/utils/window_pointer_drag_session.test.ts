import { describe, it, expect, afterEach, vi } from 'vitest';
import { WindowPointerDragSession } from '@/utils/session_window_pointer_drag.js';

describe('WindowPointerDragSession', () => {
  let session: WindowPointerDragSession;

  afterEach(() => {
    session?.end();
  });

  it('should invoke move and up callbacks from window capture events', () => {
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

  it('should attach capture-phase listeners to a custom target window', () => {
    session = new WindowPointerDragSession();
    const onMove = vi.fn();
    const onUp = vi.fn();
    const targetWindow = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      document: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        hidden: false,
      },
    } as unknown as Window;
    session.begin(onMove, onUp, targetWindow);
    expect(targetWindow.addEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function), true);
    expect(targetWindow.addEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function), true);
    expect(targetWindow.addEventListener).toHaveBeenCalledWith('pointercancel', expect.any(Function), true);
    expect(targetWindow.addEventListener).toHaveBeenCalledWith('blur', expect.any(Function));
    session.end();
    expect(targetWindow.removeEventListener).toHaveBeenCalledWith('pointermove', expect.any(Function), true);
  });

  it('should end the drag on window blur so OS popups cannot leave a stuck session', () => {
    session = new WindowPointerDragSession();
    const onUp = vi.fn();
    session.begin(() => undefined, onUp);
    window.dispatchEvent(new Event('blur'));
    expect(onUp).toHaveBeenCalledTimes(1);
    expect(session.isActive()).toBe(false);
  });

  it('should set and release pointer capture on the pick element when provided', () => {
    session = new WindowPointerDragSession();
    const element = document.createElement('div') as HTMLElement & {
      setPointerCapture: (pointerId: number) => void;
      releasePointerCapture: (pointerId: number) => void;
      hasPointerCapture: (pointerId: number) => boolean;
    };
    element.setPointerCapture = vi.fn();
    element.releasePointerCapture = vi.fn();
    element.hasPointerCapture = vi.fn(() => true);
    session.begin(
      () => undefined,
      () => undefined,
      window,
      { element, pointerId: 7 },
    );
    expect(element.setPointerCapture).toHaveBeenCalledWith(7);
    session.end();
    expect(element.releasePointerCapture).toHaveBeenCalledWith(7);
  });
});
