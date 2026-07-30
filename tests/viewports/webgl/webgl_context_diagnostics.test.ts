import { describe, expect, it, vi } from 'vitest';
import {
  attachWebGLContextDiagnostics,
  markWebGLContextLossAsIntentional,
  WebGLContextStateChange,
} from '@/viewports/webgl/webgl_context_diagnostics.js';

describe('WebGL context diagnostics', () => {
  it('should prevent default context loss and report the owner', () => {
    const canvas = document.createElement('canvas');
    const changes: WebGLContextStateChange[] = [];
    attachWebGLContextDiagnostics(canvas, 'viewport:Perspective', (change) => {
      changes.push(change);
    });

    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(changes).toEqual([{ ownerName: 'viewport:Perspective', state: 'lost' }]);
  });

  it('should suppress intentional context loss from dispose', () => {
    const canvas = document.createElement('canvas');
    const onStateChange = vi.fn();
    attachWebGLContextDiagnostics(canvas, 'detached_viewport', onStateChange);
    markWebGLContextLossAsIntentional(canvas);
    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('should still report unexpected losses after intentional marker is consumed', () => {
    const canvas = document.createElement('canvas');
    const onStateChange = vi.fn();
    attachWebGLContextDiagnostics(canvas, 'shared_workspace', onStateChange);
    markWebGLContextLossAsIntentional(canvas);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith({ ownerName: 'shared_workspace', state: 'lost' });
  });

  it('should report context restoration for the same owner', () => {
    const canvas = document.createElement('canvas');
    const onStateChange = vi.fn();
    attachWebGLContextDiagnostics(canvas, 'camera_widget', onStateChange);

    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(onStateChange).toHaveBeenCalledWith({
      ownerName: 'camera_widget',
      state: 'restored',
    });
  });

  it('should log the browser status for context creation failures', () => {
    const canvas = document.createElement('canvas');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const event = new Event('webglcontextcreationerror');
    Object.defineProperty(event, 'statusMessage', {
      value: 'GPU process disabled',
    });

    attachWebGLContextDiagnostics(canvas, 'viewport:Perspective');
    canvas.dispatchEvent(event);

    expect(consoleError).toHaveBeenCalledWith(
      '[AiWorldEd] WebGL context creation failed for viewport:Perspective: GPU process disabled. Check WebGL2 support, GPU drivers, and desktop hardware acceleration.',
    );
    consoleError.mockRestore();
  });
});
