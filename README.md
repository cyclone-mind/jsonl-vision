# JSONL Vision

A VS Code extension that turns a single line of a `.jsonl` / `.ndjson` file into an
interactive, editable node graph — one record at a time.

## Why

Inspecting one line of a big JSONL log usually means copying it out to a website and
pasting it into a JSON viewer. JSONL Vision does it in place: put the cursor on a line
and that record renders as a warm-themed graph you can read and edit, with edits
written straight back to the file.

## Features

- **Per-line JSONL** — each line opens as its own graph in its own tab; move the cursor
  to a new line and a new tab opens.
- **Inline editing** — double-click a scalar value, edit, and it's written back to the
  file immediately.
- **Readable graph** — depth-colored node headers, orthogonal connectors, inline color
  swatches, collapsible objects, a dotted canvas.
- **Warm theme** — dark or cream, following your VS Code theme or pinned via the
  `jsonl-vision.background` setting.
- **Plain `.json` too** — the whole-file graph mode is retained.
- **Fully offline** — nothing leaves your editor.

## Install (local)

Not yet on the marketplace. Build a `.vsix` and install it:

```sh
pnpm install
pnpm run --filter jsonl-vision... build   # or: pnpm run build:vscode (from jsoncrack.com/)
cd jsoncrack.com/apps/vscode
npx vsce package
code --install-extension jsonl-vision-0.1.0.vsix
```

## Layout

The upstream [JSON Crack](https://jsoncrack.com) monorepo is vendored under
[`jsoncrack.com/`](jsoncrack.com/). The parts that matter here:

- [`jsoncrack.com/apps/vscode`](jsoncrack.com/apps/vscode) — the extension (host + webview).
- [`jsoncrack.com/packages/jsoncrack-react`](jsoncrack.com/packages/jsoncrack-react) — the graph engine.
- [`docs/adr/0001-jsonl-vision-architecture.md`](docs/adr/0001-jsonl-vision-architecture.md) — the design decisions and why.

For extension development instructions, see
[`jsoncrack.com/apps/vscode/README.md`](jsoncrack.com/apps/vscode/README.md).

## Credits & license

Built on the open-source [JSON Crack](https://jsoncrack.com) engine
(`packages/jsoncrack-react`, Apache-2.0) and its VS Code scaffold (`apps/vscode`, MIT),
both vendored with their license and copyright notices preserved. JSONL Vision is an
independent project, not affiliated with or endorsed by JSON Crack. See
[`NOTICE.md`](jsoncrack.com/apps/vscode/NOTICE.md).
