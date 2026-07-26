import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '../../../src/commands/command_stack.js';
import { SceneIOHandler } from '../../../src/managers/tools/scene_io_handler.js';
import { runLayoutNewScene } from '../../../src/managers/layout/layout_scene_io_actions.js';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import type { StatusBar } from '../../../src/ui/status_bar.js';
import type { SolidModelController } from '../../../src/managers/solid/solid_model_controller.js';

describe('runLayoutNewScene', () => {
  let host: HTMLElement;
  let world: THREE.Group;
  let commandStack: CommandStack;
  let sceneIOHandler: SceneIOHandler;
  let statusBar: StatusBar;
  let solidModelController: SolidModelController;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    world = new THREE.Group();
    commandStack = new CommandStack(32);
    sceneIOHandler = new SceneIOHandler();
    solidModelController = {
      adoptFirstSolidModelInWorld: vi.fn(() => true),
    } as unknown as SolidModelController;
    statusBar = {
      setLastAction: vi.fn(),
      setLastSavedInfo: vi.fn(),
      setErrorText: vi.fn(),
    } as unknown as StatusBar;
  });

  afterEach(() => {
    document.querySelectorAll('.editor-confirm-dialog-backdrop').forEach((node) => node.remove());
    host.remove();
  });

  it('seeds the default solid cube without prompting when the scene is empty', async () => {
    const onCleared = vi.fn();
    await runLayoutNewScene(host, sceneIOHandler, world, commandStack, statusBar, solidModelController, onCleared);
    expect(host.querySelector('.editor-confirm-dialog-backdrop')).toBeNull();
    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(world.children.length).toBe(1);
    expect(SolidModel.isSolidModelObject(world.children[0]!)).toBe(true);
    expect(solidModelController.adoptFirstSolidModelInWorld).toHaveBeenCalledTimes(1);
    expect(statusBar.setLastAction).toHaveBeenCalledWith('Created new scene');
  });

  it('prompts and aborts when the user chooses No', async () => {
    world.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    const onCleared = vi.fn();
    const promise = runLayoutNewScene(
      host,
      sceneIOHandler,
      world,
      commandStack,
      statusBar,
      solidModelController,
      onCleared,
    );
    const no = host.querySelector('[data-confirm-cancel="true"]') as HTMLButtonElement;
    no.click();
    await promise;
    expect(onCleared).not.toHaveBeenCalled();
    expect(world.children.length).toBe(1);
    expect(solidModelController.adoptFirstSolidModelInWorld).not.toHaveBeenCalled();
  });

  it('replaces existing content with the default solid cube when Yes is chosen', async () => {
    world.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    const onCleared = vi.fn();
    const promise = runLayoutNewScene(
      host,
      sceneIOHandler,
      world,
      commandStack,
      statusBar,
      solidModelController,
      onCleared,
    );
    const yes = host.querySelector('[data-confirm-accept="true"]') as HTMLButtonElement;
    yes.click();
    await promise;
    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(world.children.length).toBe(1);
    expect(SolidModel.isSolidModelObject(world.children[0]!)).toBe(true);
    expect(world.children[0]!.name).toBe('DefaultModel');
    expect(solidModelController.adoptFirstSolidModelInWorld).toHaveBeenCalledTimes(1);
  });
});
