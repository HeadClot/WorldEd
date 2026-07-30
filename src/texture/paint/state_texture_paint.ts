import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';

/** Tracks the last texture chosen in the browser for paint / fill operations. */
export class StateTexturePaint {
  private lastTextureId: string;

  /** Creates paint state defaulting to the built-in checker. */
  constructor() {
    this.lastTextureId = DEFAULT_CHECKER_TEXTURE_ID;
  }

  /**
   * Returns the last selected texture id.
   *
   * @returns Texture id (never empty).
   */
  getLastTextureId(): string {
    return this.lastTextureId;
  }

  /**
   * Records the last selected texture id for fills and new surfaces.
   *
   * @param textureId Texture id to remember.
   */
  setLastTextureId(textureId: string): void {
    if (!textureId) return;
    this.lastTextureId = textureId;
  }

  /** Resets to the built-in checker (tests / teardown). */
  reset(): void {
    this.lastTextureId = DEFAULT_CHECKER_TEXTURE_ID;
  }
}

let sharedPaintState: StateTexturePaint | null = null;

/**
 * Returns the process-wide paint state singleton.
 *
 * @returns Shared TexturePaintState.
 */
export function getStateTexturePaint(): StateTexturePaint {
  if (!sharedPaintState) {
    sharedPaintState = new StateTexturePaint();
  }
  return sharedPaintState;
}

/**
 * Replaces the shared paint state (tests only).
 *
 * @param state State to install, or null to clear.
 */
export function setStateTexturePaintForTests(state: StateTexturePaint | null): void {
  sharedPaintState = state;
}
