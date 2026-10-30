# Changelog

## Unreleased

### Added

- Search the current graph (Ctrl/Cmd+F or the Find box): keys and values match case-insensitively, matches are highlighted, and Enter / Shift+Enter center the next or previous match. A count shows how many fields matched.
- Search across JSONL lines from that box. Next and previous line scan the file text and do not parse every record.
- **JSONL Vision: Go to Line** opens a JSONL record by line number.
- Previous and next record (Alt+Left / Alt+Right and buttons) work on plain JSONL files as well as in agent session mode.
- Export the current graph as PNG (theme background or transparent) or SVG. The file dialog defaults to the source name plus the line number. Copy Graph as PNG puts the image on the clipboard. Exports cover the whole graph and are scaled down if they would exceed the size cap.
- Collapse all / Expand all, and Rotate Layout (left-to-right or top-to-bottom). The direction is stored in `jsonl-vision.layoutDirection`.

## 0.3.0 — 2026-10-30

### Added

- Agent session mode for Claude Code session files (`~/.claude/projects/<project>/<session>.jsonl`) and Codex CLI rollout files (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`). The first lines are sniffed; user, assistant, tool call, tool result, and meta records are labeled, tool name and inputs are shown with a nearby paired result, and string fields that contain JSON become nested nodes. Edits inside those strings are written back re-serialized; paired values, labels, and shortened long text stay read-only. Previous/next record and a one-line summary sit on the graph. `jsonl-vision.detectAgentSessions` turns auto-detection off. **JSONL Vision: Toggle Agent Session Mode** switches the open file.

## 0.2.0

### Added

- CI (`.github/workflows/ci.yml`) runs `pnpm test`, `pnpm run lint`, and `vsce package` on pushes to `main` and on pull requests, and uploads the `.vsix`.
- Pushing a `v*.*.*` tag (`.github/workflows/release.yml`) builds that `.vsix` once, publishes it to the VS Code Marketplace with Trusted Publishing (`vsce publish --oidc`, no `VSCE_PAT`) and to Open VSX (`OVSX_PAT`), and attaches it to a GitHub release. A missing `OVSX_PAT` skips Open VSX with a warning. The Marketplace publish and the GitHub release still run.
- Marketplace listing: a searchable name and description (JSONL, NDJSON, JSON Lines, JSON Crack-style graph, value editing), keywords, the Data Science category, a gallery banner, and a homepage.

### Fixed

- Tab anchors shift when lines above them are inserted or deleted, so a later edit is not written to the wrong record ([#1](https://github.com/cyclone-mind/jsonl-vision/pull/1)).
- The graph tab and the editor cursor stay on the same JSONL line, including when a closed line is opened again ([#2](https://github.com/cyclone-mind/jsonl-vision/pull/2)).
- Scalar edits that would corrupt a line (inherited keys, array `length`, non-finite numbers, a missing value) are rejected instead of being written ([#3](https://github.com/cyclone-mind/jsonl-vision/pull/3)).
- Invalid, too-deep, or oversized JSON explains why it was not graphed, instead of leaving an empty canvas ([#4](https://github.com/cyclone-mind/jsonl-vision/pull/4)).
- `jsonl-vision.background` matches the live behavior: open panels update immediately.
- The editor-title button matches `.json`, `.jsonl`, `.ndjson`, and `.jsonlines` regardless of letter case.
