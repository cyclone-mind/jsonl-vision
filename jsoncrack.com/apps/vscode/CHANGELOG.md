# Changelog

## 0.2.0

### Added

- CI (`.github/workflows/ci.yml`) runs `pnpm test`, `pnpm run lint`, and `vsce package` on pushes to `main` and on pull requests, and uploads the `.vsix`.
- Pushing a `v*.*.*` tag (`.github/workflows/release.yml`) builds that `.vsix` once, publishes it to the VS Code Marketplace and Open VSX, and attaches it to a GitHub release. A missing `VSCE_PAT` or `OVSX_PAT` skips that registry with a warning. The other publish and the GitHub release still run.
- Marketplace listing: a searchable name and description (JSONL, NDJSON, JSON Lines, JSON Crack-style graph, value editing), keywords, the Data Science category, a gallery banner, and a homepage.

### Fixed

- Tab anchors shift when lines above them are inserted or deleted, so a later edit is not written to the wrong record ([#1](https://github.com/cyclone-mind/jsonl-vision/pull/1)).
- The graph tab and the editor cursor stay on the same JSONL line, including when a closed line is opened again ([#2](https://github.com/cyclone-mind/jsonl-vision/pull/2)).
- Scalar edits that would corrupt a line (inherited keys, array `length`, non-finite numbers, a missing value) are rejected instead of being written ([#3](https://github.com/cyclone-mind/jsonl-vision/pull/3)).
- Invalid, too-deep, or oversized JSON explains why it was not graphed, instead of leaving an empty canvas ([#4](https://github.com/cyclone-mind/jsonl-vision/pull/4)).
- `jsonl-vision.background` matches the live behavior: open panels update immediately.
- The editor-title button matches `.json`, `.jsonl`, `.ndjson`, and `.jsonlines` regardless of letter case.
