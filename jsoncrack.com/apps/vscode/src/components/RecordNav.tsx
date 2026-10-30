export interface RecordNavState {
  line: number | null;
  lineCount: number;
  canPrev: boolean;
  canNext: boolean;
}

interface RecordNavProps {
  record: RecordNavState;
  onPrev: () => void;
  onNext: () => void;
}

/** Previous/next JSONL record. Shown when agent session mode is not already providing the buttons. */
export function RecordNav({ record, onPrev, onNext }: RecordNavProps) {
  const label =
    record.line === null ? "No record" : `Line ${record.line + 1} of ${record.lineCount}`;
  return (
    <div className="jsonl-recordnav" role="navigation" aria-label="JSONL records">
      <button
        type="button"
        className="jsonl-recordnav-btn"
        onClick={onPrev}
        disabled={!record.canPrev}
        aria-label="Previous record"
        title="Previous record (Alt+Left)"
      >
        ‹
      </button>
      <span className="jsonl-recordnav-label">{label}</span>
      <button
        type="button"
        className="jsonl-recordnav-btn"
        onClick={onNext}
        disabled={!record.canNext}
        aria-label="Next record"
        title="Next record (Alt+Right)"
      >
        ›
      </button>
    </div>
  );
}
