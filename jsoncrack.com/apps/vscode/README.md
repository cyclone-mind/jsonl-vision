# JSONL Vision

Read and edit **JSONL / NDJSON** files one line at a time. Put the cursor on a line and
that record opens as an interactive, warm-themed node graph — objects, arrays, and
values as a connected diagram you can navigate and edit in place.

## Features

- **Per-line** — each line is its own graph in its own tab; move the cursor to open the
  next one. Right-click a tab to close left / right / others.
- **Inline editing** — double-click a scalar value; the edit is written straight back to
  the file.
- **Readable** — depth-colored node headers, orthogonal connectors, inline color
  swatches, collapsible objects, on a dotted canvas.
- **`.json` too** — plain `.json` files open in whole-document graph mode.
- **Offline** — all parsing, rendering, and write-back happen locally.

## Usage

1. Open a `.jsonl`, `.ndjson`, `.jsonlines`, or `.json` file.
2. Click the **JSONL Vision** button in the editor title bar (top right).
3. Move the cursor between lines to open a tab per line; double-click a value to edit it.

## Settings

| Setting | Values | Default | Description |
|---|---|---|---|
| `jsonl-vision.background` | `auto` · `dark` · `warm` | `auto` | Canvas background: follow the VS Code theme, warm dark (charcoal), or warm light (cream). Applies when a panel is next opened. |

## Privacy

Works **fully offline** — no data is sent anywhere.

## Credits

Built on the open-source graph engine from [JSON Crack](https://jsoncrack.com)
(`packages/jsoncrack-react`, Apache-2.0) and its VS Code scaffold (`apps/vscode`, MIT),
with upstream license and copyright notices preserved (see `NOTICE.md`). JSONL Vision is
an independent project, not affiliated with or endorsed by JSON Crack.

## Development

Lives in `apps/vscode` inside the vendored `jsoncrack.com` monorepo.
**Prerequisites:** Node.js `>=20`, pnpm `>=10`. **Stack:** Vite (webview) + esbuild
(host) + React 19.

```sh
pnpm install              # from repo root
cd apps/vscode
pnpm run build            # production build
pnpm run vsc:package      # build + produce the .vsix
```

Debugging: open the **monorepo root** in VS Code and press **F5** ("Run VSCode
Extension") to launch the Extension Development Host; reload it with `Ctrl+R` / `Cmd+R`
after changes.

| Script | Description |
|---|---|
| `build` / `build:dev` | Production / dev build |
| `watch` / `watch:webview` | Watch host / webview |
| `dev` | Vite dev server (standalone webview in a browser) |
| `lint` | ESLint + Prettier |
