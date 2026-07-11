// Pure line-anchored tab state for JSONL Vision.
//
// Lifted and adapted from the validated throwaway prototype at
// prototype/line-anchor-tabs/ (git branch prototype/line-anchor-tabs).
// See docs/adr/0001-jsonl-vision-architecture.md items 5 (auto-tab-on-cursor-move,
// reuse existing tab) and 8 (line-number anchoring + drift warning).
//
// This module is intentionally free of any `vscode` import so it can be unit-run
// under plain node. The extension host feeds it absolute (0-based) line numbers
// and the current text of a line; the VS Code document itself stays the single
// source of truth for content — a tab only caches a `snapshot` so drift can be
// measured against it.

/** One open tab, anchored to a line number (not a content fingerprint — see ADR item 8). */
export interface LineTab {
  /** 0-based line number this tab is anchored to. */
  line: number;
  /** Line text at open / last sync. Drift is measured against this. */
  snapshot: string;
  /** True when the document's current text at `line` has diverged from `snapshot`. */
  drift: boolean;
}

export interface LineTabsState {
  tabs: LineTab[];
  /** Line number of the focused tab, or null when nothing is focused. */
  focusedLine: number | null;
}

export type LineTabsAction =
  // Cursor moved to `line` (content = that line's current text). Opens a new tab
  // and focuses it, or focuses the existing tab for that line without duplicating.
  | { type: "FOCUS_LINE"; line: number; content: string }
  // User clicked an existing tab in the strip.
  | { type: "CLICK_TAB"; line: number }
  // User closed a tab.
  | { type: "CLOSE_TAB"; line: number }
  // The document's text at `line` changed. Focused line auto-syncs; any other
  // open tab whose content diverged from its snapshot flips to a drift warning.
  | { type: "LINE_CHANGED"; line: number; content: string }
  // User acknowledged a drift warning: re-cache the snapshot and clear the flag.
  | { type: "REFRESH_TAB"; line: number; content: string };

export function createState(): LineTabsState {
  return { tabs: [], focusedLine: null };
}

function findTab(tabs: LineTab[], line: number): LineTab | undefined {
  return tabs.find(t => t.line === line);
}

export function reduce(state: LineTabsState, action: LineTabsAction): LineTabsState {
  switch (action.type) {
    case "FOCUS_LINE": {
      const existing = findTab(state.tabs, action.line);
      if (existing) {
        // Re-visiting a line that already has a tab focuses it, never duplicates it.
        if (state.focusedLine === action.line) return state;
        return { ...state, focusedLine: action.line };
      }
      const tab: LineTab = { line: action.line, snapshot: action.content, drift: false };
      return { tabs: [...state.tabs, tab], focusedLine: action.line };
    }

    case "CLICK_TAB": {
      if (!findTab(state.tabs, action.line)) return state;
      if (state.focusedLine === action.line) return state;
      return { ...state, focusedLine: action.line };
    }

    case "CLOSE_TAB": {
      if (!findTab(state.tabs, action.line)) return state;
      const tabs = state.tabs.filter(t => t.line !== action.line);
      const focusedLine = state.focusedLine === action.line ? null : state.focusedLine;
      return { tabs, focusedLine };
    }

    case "LINE_CHANGED": {
      const tab = findTab(state.tabs, action.line);
      if (!tab) return state;

      // Editing the line you're looking at is a live update, not drift: re-cache
      // the snapshot so the graph re-parses fresh content without a warning.
      if (state.focusedLine === action.line) {
        if (tab.snapshot === action.content && !tab.drift) return state;
        const tabs = state.tabs.map(t =>
          t.line === action.line ? { ...t, snapshot: action.content, drift: false } : t
        );
        return { ...state, tabs };
      }

      // A different open tab's line changed underneath it → surface drift rather
      // than let a later write-back silently target stale content.
      const drift = tab.snapshot !== action.content;
      if (tab.drift === drift) return state;
      const tabs = state.tabs.map(t => (t.line === action.line ? { ...t, drift } : t));
      return { ...state, tabs };
    }

    case "REFRESH_TAB": {
      const tab = findTab(state.tabs, action.line);
      if (!tab) return state;
      if (tab.snapshot === action.content && !tab.drift) return state;
      const tabs = state.tabs.map(t =>
        t.line === action.line ? { ...t, snapshot: action.content, drift: false } : t
      );
      return { ...state, tabs };
    }

    default:
      return state;
  }
}
