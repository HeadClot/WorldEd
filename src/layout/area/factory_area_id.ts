/** Allocates unique area ids for newly split panes. */
export class FactoryAreaId {
  private nextSerial: number;

  /**
   * Creates an id factory.
   *
   * @param startSerial First serial to use (defaults to 1).
   */
  constructor(startSerial = 1) {
    this.nextSerial = startSerial;
  }

  /**
   * Returns a new unique area id string.
   *
   * @returns Fresh area id.
   */
  nextId(): string {
    const id = `pane_area_${this.nextSerial}`;
    this.nextSerial += 1;
    return id;
  }

  /**
   * Advances the serial past any numeric suffixes found in existing ids so new
   * ids never collide after loading a workspace.
   *
   * @param existingIds Area ids already in use.
   */
  absorbExistingIds(existingIds: readonly string[]): void {
    for (const id of existingIds) {
      const match = /^pane_area_(\d+)$/.exec(id);
      if (!match) continue;
      const serial = Number(match[1]);
      if (Number.isFinite(serial) && serial >= this.nextSerial) {
        this.nextSerial = serial + 1;
      }
    }
  }
}
