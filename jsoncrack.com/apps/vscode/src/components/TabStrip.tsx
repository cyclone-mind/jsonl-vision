// Horizontal pill-tab strip for JSONL Vision — one pill per open line.
// This is variant C from the validated UI prototype (prototype/tab-layout-ui,
// git branch prototype/tab-layout-ui), chosen in ADR 0001 item 13: a custom
// pill strip inside the single per-file panel, rather than native per-line
// editor tabs or a vertical rail. Drift (ADR item 8) shows as an amber pill
// with a refresh affordance.

export interface TabStripTab {
  /** 0-based line number the tab is anchored to. */
  line: number;
  /** True when the document's line has diverged from the tab's cached snapshot. */
  drift: boolean;
}

interface TabStripProps {
  tabs: TabStripTab[];
  /** 0-based focused line, or null. */
  focusedLine: number | null;
  onFocus: (line: number) => void;
  onClose: (line: number) => void;
  onRefresh: (line: number) => void;
}

export function TabStrip({ tabs, focusedLine, onFocus, onClose, onRefresh }: TabStripProps) {
  return (
    <div className="jsonl-tabstrip" role="tablist" aria-label="Open JSONL lines">
      {tabs.map(tab => {
        const active = tab.line === focusedLine;
        const className = [
          "jsonl-tab",
          active ? "active" : "",
          tab.drift ? "drift" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={tab.line}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            className={className}
            title={
              tab.drift
                ? "This line changed in the file — refresh to sync this tab"
                : `Line ${tab.line + 1}`
            }
            onClick={() => onFocus(tab.line)}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onFocus(tab.line);
              }
            }}
          >
            <span className="jsonl-tab-dot" aria-hidden="true" />
            <span className="jsonl-tab-label">Line {tab.line + 1}</span>
            {tab.drift && (
              <button
                type="button"
                className="jsonl-tab-btn"
                aria-label={`Refresh line ${tab.line + 1}`}
                title="Content changed — click to refresh"
                onClick={e => {
                  e.stopPropagation();
                  onRefresh(tab.line);
                }}
              >
                ⟳
              </button>
            )}
            <button
              type="button"
              className="jsonl-tab-btn jsonl-tab-close"
              aria-label={`Close line ${tab.line + 1}`}
              title="Close"
              onClick={e => {
                e.stopPropagation();
                onClose(tab.line);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
