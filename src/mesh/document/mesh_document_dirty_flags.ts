/** Dirty flags tracking which document channels need presentation rebuild. */
export class MeshDocumentDirtyFlags {
  private positionsDirty: boolean;
  private topologyDirty: boolean;
  private attributesDirty: boolean;

  /** Creates clean dirty flags. */
  constructor() {
    this.positionsDirty = false;
    this.topologyDirty = false;
    this.attributesDirty = false;
  }

  /** Marks vertex positions dirty. */
  markPositionsDirty(): void {
    this.positionsDirty = true;
  }

  /** Marks topology connectivity dirty. */
  markTopologyDirty(): void {
    this.topologyDirty = true;
  }

  /** Marks face/corner attributes dirty. */
  markAttributesDirty(): void {
    this.attributesDirty = true;
  }

  /**
   * Returns whether positions are dirty.
   *
   * @returns True when positions need rebuild.
   */
  isPositionsDirty(): boolean {
    return this.positionsDirty;
  }

  /**
   * Returns whether topology is dirty.
   *
   * @returns True when connectivity needs rebuild.
   */
  isTopologyDirty(): boolean {
    return this.topologyDirty;
  }

  /**
   * Returns whether attributes are dirty.
   *
   * @returns True when attributes need rebuild.
   */
  isAttributesDirty(): boolean {
    return this.attributesDirty;
  }

  /**
   * Returns whether any channel is dirty.
   *
   * @returns True when presentation should rebuild.
   */
  isAnyDirty(): boolean {
    return this.positionsDirty || this.topologyDirty || this.attributesDirty;
  }

  /** Clears all dirty flags after a successful presentation sync. */
  clearAll(): void {
    this.positionsDirty = false;
    this.topologyDirty = false;
    this.attributesDirty = false;
  }

  /**
   * Clones dirty flag state.
   *
   * @returns Independent flags copy.
   */
  clone(): MeshDocumentDirtyFlags {
    const copy = new MeshDocumentDirtyFlags();
    if (this.positionsDirty) {
      copy.markPositionsDirty();
    }
    if (this.topologyDirty) {
      copy.markTopologyDirty();
    }
    if (this.attributesDirty) {
      copy.markAttributesDirty();
    }
    return copy;
  }
}
