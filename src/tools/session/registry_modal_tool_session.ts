/**
 * A modal editor tool session (clip, future sculpt, etc.) that can end itself
 * when the selection changes for unrelated reasons.
 */
export interface SessionModalTool {
  /** Stable session id (also used as overlay suppress reason when paired). */
  id: string;
  /** When true, external selection changes end this session. */
  endsOnSelectionChange: boolean;
  /** Cleanly ends the tool (restore default tool, clear state). */
  end: () => void;
}

/**
 * Registry of active modal tools. Central place for selection-driven cancel so
 * create/add menus and future tools do not each reimplement the same side
 * effects.
 */
export class RegistryModalToolSession {
  private sessions: Map<string, SessionModalTool>;
  private selectionEndSuppressDepth: number;

  /** Creates an empty registry. */
  constructor() {
    this.sessions = new Map();
    this.selectionEndSuppressDepth = 0;
  }

  /**
   * Registers or replaces a modal session.
   *
   * @param session Session to track.
   */
  register(session: SessionModalTool): void {
    this.sessions.set(session.id, session);
  }

  /**
   * Unregisters a session without calling {@link ModalToolSession.end}.
   *
   * @param sessionId Session id.
   */
  unregister(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Returns whether a session is currently registered.
   *
   * @param sessionId Session id.
   * @returns True when registered.
   */
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Runs work that may change selection without ending modal sessions (e.g.
   * clip commit re-selecting result meshes).
   *
   * @param work Synchronous work that mutates selection.
   */
  runWithSelectionEndSuppressed(work: () => void): void {
    this.selectionEndSuppressDepth += 1;
    try {
      work();
    } finally {
      this.selectionEndSuppressDepth -= 1;
    }
  }

  /**
   * Ends every active session that opts into selection-change cancellation.
   * Call from the editor's global selection-changed path.
   */
  onSelectionChanged(): void {
    if (this.selectionEndSuppressDepth > 0) return;
    const sessionsToEnd = Array.from(this.sessions.values()).filter((session) => session.endsOnSelectionChange);
    sessionsToEnd.forEach((session) => {
      this.sessions.delete(session.id);
      session.end();
    });
  }
}
