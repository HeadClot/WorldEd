import { UndoCommand } from '../undo_command.js';
import { restoreTransformTextureState, type TransformTextureSnapshot } from './transform_texture_state.js';

/**
 * Wraps a pose transform command with before/after texture state so position
 * and stretch lock UV updates undo/redo with the mesh transform.
 */
export class TextureLockedTransformCommand implements UndoCommand {
  private readonly inner: UndoCommand;
  private readonly beforeTexture: TransformTextureSnapshot[];
  private readonly afterTexture: TransformTextureSnapshot[];

  /**
   * Creates a texture-aware transform command.
   *
   * @param inner Pose-only transform command (translate/rotate/scale/bounds).
   * @param beforeTexture Texture state at drag start.
   * @param afterTexture Texture state after the locked transform.
   */
  constructor(inner: UndoCommand, beforeTexture: TransformTextureSnapshot[], afterTexture: TransformTextureSnapshot[]) {
    this.inner = inner;
    this.beforeTexture = beforeTexture;
    this.afterTexture = afterTexture;
  }

  /**
   * Applies the final pose and post-transform texture state (redo / first
   * push).
   */
  execute(): void {
    this.inner.execute();
    restoreTransformTextureState(this.afterTexture);
  }

  /** Restores the pre-transform pose and texture state. */
  undo(): void {
    this.inner.undo();
    restoreTransformTextureState(this.beforeTexture);
  }
}
