import { describe, it, expect } from 'vitest';
import { SolidModelController } from '../../../src/managers/solid/solid_model_controller.js';
import { TransformMode } from '../../../src/types/transform_mode.js';
import { CommandStack } from '../../../src/commands/command_stack.js';
import { SelectionManager } from '../../../src/selection/object/selection_manager.js';
import { SolidModelPanel } from '../../../src/ui/solid_model_panel.js';
import * as THREE from 'three';

/**
 * Rotation must force full texture stick so unlocked stretch/pos does not
 * rewrite UV matrices mid-orbit.
 */
describe('SolidModelController rotate texture locks', () => {
  it('forces both texture locks on while transform mode is rotate', () => {
    const world = new THREE.Group();
    const stack = new CommandStack(16);
    const selection = new SelectionManager();
    const panelHost = document.createElement('div');
    const panel = new SolidModelPanel(panelHost, { onAddBoxBrush: () => undefined }, panelHost);
    const controller = new SolidModelController(world, stack, selection, panel);
    let mode = TransformMode.SCALE;
    controller.setTransformModeProvider(() => mode);
    // Access private method via bracket for unit coverage of lock policy.
    const getLocks = (
      controller as unknown as {
        getTextureLockFlagsForActiveTransform: () => { positionLock: boolean; stretchLock: boolean };
      }
    ).getTextureLockFlagsForActiveTransform.bind(controller);
    mode = TransformMode.SCALE;
    // Without texture lock settings, scale mode returns both off.
    expect(getLocks()).toEqual({ positionLock: false, stretchLock: false });
    mode = TransformMode.ROTATE;
    expect(getLocks()).toEqual({ positionLock: true, stretchLock: true });
    mode = TransformMode.BOUNDS;
    expect(getLocks()).toEqual({ positionLock: false, stretchLock: false });
  });
});
