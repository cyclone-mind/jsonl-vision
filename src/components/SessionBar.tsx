export type SessionRole = "user" | "assistant" | "tool_call" | "tool_result" | "meta" | "record";

export interface SessionBarState {
  enabled: boolean;
  /** True when the user turned the mode off on a file that still looks like a session. */
  resume: boolean;
  family: "claude" | "codex" | "generic";
  role: SessionRole;
  roleLabel: string;
  summary: string;
  /** 0-based focused line, or null when nothing is focused. */
  line: number | null;
  lineCount: number;
  canPrev: boolean;
  canNext: boolean;
  lockedPaths: (string | number)[][];
}

interface SessionBarProps {
  session: SessionBarState;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
}

const FAMILY_LABEL: Record<SessionBarState["family"], string> = {
  claude: "Claude Code",
  codex: "Codex",
  generic: "Agent session",
};

export function SessionBar({ session, onPrev, onNext, onToggle }: SessionBarProps) {
  if (!session.enabled && session.resume) {
    return (
      <div className="session-bar session-resume" role="region" aria-label="Agent session mode">
        <span className="session-summary">
          {FAMILY_LABEL[session.family]} session — showing raw JSON
        </span>
        <button type="button" className="session-textbtn" onClick={onToggle}>
          Session view
        </button>
      </div>
    );
  }

  if (!session.enabled) return null;

  const lineLabel =
    session.line === null ? "No record" : `Line ${session.line + 1} of ${session.lineCount}`;

  return (
    <div
      className="session-bar"
      data-role={session.role}
      role="region"
      aria-label="Agent session mode"
    >
      <button
        type="button"
        className="session-nav"
        onClick={onPrev}
        disabled={!session.canPrev}
        aria-label="Previous record"
        title="Previous record (Alt+Left)"
      >
        ‹
      </button>
      <div className="session-copy">
        <span className="session-kicker">
          {FAMILY_LABEL[session.family]}
          <span className="session-role">{session.roleLabel}</span>
        </span>
        <span className="session-summary">{session.summary}</span>
      </div>
      <span className="session-line">{lineLabel}</span>
      <button type="button" className="session-textbtn" onClick={onToggle}>
        Raw JSON
      </button>
      <button
        type="button"
        className="session-nav"
        onClick={onNext}
        disabled={!session.canNext}
        aria-label="Next record"
        title="Next record (Alt+Right)"
      >
        ›
      </button>
    </div>
  );
}
