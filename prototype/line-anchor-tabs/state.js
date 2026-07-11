'use strict';

// PROTOTYPE — pure state machine for JSONL Vision's line-anchored tab tracking.
// See docs/adr/0001-jsonl-vision-architecture.md, items 5 and 8.
// No I/O, no console, no terminal code — this module is the part worth lifting
// into the real extension host if the interaction model holds up.

function createInitialState(lines) {
  return {
    lines: lines.slice(),
    trackingActive: false,
    cursorLine: 0,
    tabs: [], // { id, line, snapshot, drift }
    focusedTabId: null,
    nextTabId: 1,
    log: [],
  };
}

function pushLog(state, message) {
  return { ...state, log: state.log.concat(message).slice(-5) };
}

function findTabByLine(tabs, line) {
  return tabs.find((t) => t.line === line) || null;
}

function reduce(state, action) {
  switch (action.type) {
    case 'TOGGLE_TRACKING': {
      const trackingActive = !state.trackingActive;
      return pushLog(
        { ...state, trackingActive },
        trackingActive ? 'Tracking activated (button clicked)' : 'Tracking deactivated (button clicked again)'
      );
    }

    case 'MOVE_CURSOR': {
      const delta = action.direction === 'up' ? -1 : 1;
      const cursorLine = Math.max(0, Math.min(state.lines.length - 1, state.cursorLine + delta));
      if (cursorLine === state.cursorLine) return state;
      let next = { ...state, cursorLine };

      if (!next.trackingActive) {
        return pushLog(next, `Cursor -> line ${cursorLine} (tracking off, no tab action)`);
      }

      const existing = findTabByLine(next.tabs, cursorLine);
      if (existing) {
        next = { ...next, focusedTabId: existing.id };
        return pushLog(next, `Cursor -> line ${cursorLine}; existing tab #${existing.id} focused (no duplicate)`);
      }

      const tab = { id: next.nextTabId, line: cursorLine, snapshot: next.lines[cursorLine], drift: false };
      next = {
        ...next,
        tabs: next.tabs.concat(tab),
        focusedTabId: tab.id,
        nextTabId: next.nextTabId + 1,
      };
      return pushLog(next, `Cursor -> line ${cursorLine}; opened new tab #${tab.id}, focused`);
    }

    case 'CLICK_TAB': {
      const tab = state.tabs.find((t) => t.id === action.tabId);
      if (!tab) return state;
      return pushLog({ ...state, focusedTabId: tab.id }, `Tab #${tab.id} clicked directly, focused`);
    }

    case 'CLOSE_TAB': {
      const tab = state.tabs.find((t) => t.id === action.tabId);
      if (!tab) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.tabId);
      const focusedTabId = state.focusedTabId === action.tabId ? null : state.focusedTabId;
      return pushLog({ ...state, tabs, focusedTabId }, `Tab #${tab.id} (line ${tab.line}) closed`);
    }

    case 'EXTERNAL_EDIT': {
      const { line, newContent } = action;
      if (line < 0 || line >= state.lines.length) return state;
      const lines = state.lines.slice();
      lines[line] = newContent;
      let next = { ...state, lines };

      const tab = findTabByLine(next.tabs, line);
      if (tab && tab.snapshot !== newContent) {
        const tabs = next.tabs.map((t) => (t.id === tab.id ? { ...t, drift: true } : t));
        next = { ...next, tabs };
        return pushLog(next, `Line ${line} edited externally; tab #${tab.id} now shows drift warning`);
      }
      return pushLog(next, `Line ${line} edited externally (no open tab anchored there)`);
    }

    case 'COMMIT_EDIT': {
      const tab = state.tabs.find((t) => t.id === action.tabId);
      if (!tab) return state;
      if (tab.drift) {
        return pushLog(state, `Commit blocked on tab #${tab.id}: drift warning must be acknowledged first`);
      }
      const lines = state.lines.slice();
      lines[tab.line] = action.newValue;
      const tabs = state.tabs.map((t) => (t.id === tab.id ? { ...t, snapshot: action.newValue } : t));
      return pushLog({ ...state, lines, tabs }, `Tab #${tab.id} committed edit, wrote back to line ${tab.line}`);
    }

    case 'REFRESH_TAB': {
      const tab = state.tabs.find((t) => t.id === action.tabId);
      if (!tab) return state;
      const currentContent = state.lines[tab.line];
      const tabs = state.tabs.map((t) =>
        t.id === tab.id ? { ...t, snapshot: currentContent, drift: false } : t
      );
      return pushLog({ ...state, tabs }, `Tab #${tab.id} refreshed; now in sync with line ${tab.line}, drift cleared`);
    }

    case 'INSERT_LINE_BELOW_CURSOR': {
      const at = state.cursorLine + 1;
      const lines = state.lines.slice();
      lines.splice(at, 0, action.content);
      // Deliberately NOT shifting tab.line anchors — the accepted gap from ADR item 8.
      return pushLog({ ...state, lines }, `Inserted new line at ${at} (tab anchors NOT shifted — known gap, see ADR #8)`);
    }

    case 'DELETE_CURSOR_LINE': {
      if (state.lines.length <= 1) return pushLog(state, 'Refused to delete: file needs at least 1 line');
      const at = state.cursorLine;
      const lines = state.lines.slice();
      lines.splice(at, 1);
      const cursorLine = Math.min(at, lines.length - 1);
      return pushLog({ ...state, lines, cursorLine }, `Deleted line ${at} (tab anchors NOT shifted — known gap, see ADR #8)`);
    }

    default:
      return state;
  }
}

module.exports = { createInitialState, reduce, findTabByLine };
