// Horizontal pill-tab strip for JSONL Vision — one pill per open line.
// This is variant C from the validated UI prototype (prototype/tab-layout-ui,
// git branch prototype/tab-layout-ui), chosen in ADR 0001 item 13: a custom
// pill strip inside the single per-file panel, rather than native per-line
// editor tabs or a vertical rail. Drift (ADR item 8) shows as an amber pill
// with a refresh affordance. Right-clicking a pill opens a close menu
// (close / others / to the left / to the right — ADR item 17).

import { useEffect, useState } from "react";

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
  onCloseLeft: (line: number) => void;
  onCloseRight: (line: number) => void;
  onCloseOthers: (line: number) => void;
}

interface MenuState {
  line: number;
  /** Index in strip order, for enabling left/right options. */
  index: number;
  x: number;
  y: number;
}

export function TabStrip({
  tabs,
  focusedLine,
  onFocus,
  onClose,
  onRefresh,
  onCloseLeft,
  onCloseRight,
  onCloseOthers,
}: TabStripProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Dismiss the context menu on any outside interaction.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  const run = (fn: (line: number) => void, line: number) => {
    fn(line);
    setMenu(null);
  };

  return (
    <div className="jsonl-tabstrip" role="tablist" aria-label="Open JSONL lines">
      {tabs.map((tab, index) => {
        const active = tab.line === focusedLine;
        const className = ["jsonl-tab", active ? "active" : "", tab.drift ? "drift" : ""]
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
            onContextMenu={e => {
              e.preventDefault();
              e.stopPropagation();
              setMenu({ line: tab.line, index, x: e.clientX, y: e.clientY });
            }}
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

      {menu && (
        <div
          className="jsonl-tab-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={e => e.stopPropagation()}
          onContextMenu={e => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="jsonl-tab-menuitem"
            onClick={() => run(onClose, menu.line)}
          >
            Close
          </button>
          <button
            type="button"
            role="menuitem"
            className="jsonl-tab-menuitem"
            disabled={tabs.length <= 1}
            onClick={() => run(onCloseOthers, menu.line)}
          >
            Close others
          </button>
          <button
            type="button"
            role="menuitem"
            className="jsonl-tab-menuitem"
            disabled={menu.index <= 0}
            onClick={() => run(onCloseLeft, menu.line)}
          >
            Close to the left
          </button>
          <button
            type="button"
            role="menuitem"
            className="jsonl-tab-menuitem"
            disabled={menu.index >= tabs.length - 1}
            onClick={() => run(onCloseRight, menu.line)}
          >
            Close to the right
          </button>
        </div>
      )}
    </div>
  );
}
