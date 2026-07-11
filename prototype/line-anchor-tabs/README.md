# PROTOTYPE — line-anchor + tab state machine

**Question:** does the line-anchored, one-tab-per-line interaction model in
[ADR 0001](../../docs/adr/0001-jsonl-vision-architecture.md) (items 5 and 8) hold up when driven by hand? Specifically:

1. First click on the editor/title button activates line-tracking for a file.
2. Once tracking is active, moving the cursor to a new line auto-opens a new tab for that line and focuses it.
3. Moving back to (or clicking) a line that already has an open tab focuses the existing tab instead of duplicating it.
4. If a line's content drifts (edited elsewhere) while a tab is open on it, the tab surfaces a drift warning instead of silently writing to the wrong line on commit.

This is throwaway code — it exists to validate the *idea*, not to ship. No VS Code, no webview, no graph rendering: just a fake JSONL file, a keyboard-driven "editor" cursor, and a tab list, all in a terminal.

## Run

    node prototype/line-anchor-tabs/tui.js

## Suggested walkthrough

1. Press `j`/`k` with tracking off — confirm no tabs open.
2. Press `b` to activate tracking, then `j`/`k` — confirm a new tab opens and focuses on every new line.
3. Move away and back to a line with an existing tab — confirm it focuses the existing tab instead of opening a duplicate.
4. Move cursor to a line with an open tab, press `e` (simulates an external edit to that line) — confirm the tab flips to DRIFT.
5. Press `c` on a drifted tab — confirm the commit is blocked. Press `r` to refresh/acknowledge, then `c` — confirm it now commits.
6. Press `i` or `d` near an open tab to insert/delete a line — watch the tab's anchor *not* follow the shifted content. This is the gap ADR item 8 explicitly accepts (content-fingerprint anchoring was rejected as premature); use this to decide whether that call still feels right once you see it happen.

## Files

- `state.js` — pure reducer (`(state, action) => state`), no I/O. This is the part worth lifting into the real extension host if the model holds up.
- `tui.js` — throwaway terminal shell. Not meant to survive past this prototype.

## Known simplifications

- Tab hotkeys are single digits (`1`-`9`) tied to tab id, so the TUI gets awkward past 9 tabs open at once — a shell limitation, not a logic limitation.
- Only one file/document is simulated (multi-file tracking is out of scope for this question).
