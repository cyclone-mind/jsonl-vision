# JSONL Vision

A Visual Studio Code extension for reading and editing **JSONL / NDJSON** files one
line at a time. Point it at a line of a `.jsonl` file and that single record opens as
an interactive, warm-themed node graph — objects, arrays, and values rendered as a
connected diagram. Moving the cursor to another line opens a new tab for that line;
double-click a scalar value to edit it and the change is written straight back to the
file.

Plain `.json` files still open in the inherited whole-document graph mode.

## How to use

1. Build and install the extension locally (see [Development](#development)) — this
   extension is currently self-use only and is not published to the marketplace.
2. Open a `.jsonl`, `.ndjson`, or `.jsonlines` file (or a plain `.json` file).
3. Click the **JSONL Vision** icon in the editor title bar (top right).
4. Move the cursor between lines to open a tab per line; double-click a value to edit it.

## Privacy

The extension works **fully offline**. No data is sent to any server. All parsing,
visualization, and write-back happen locally in your editor.

## Credits

JSONL Vision is built on the open-source graph engine from
[JSON Crack](https://jsoncrack.com) (`packages/jsoncrack-react`, Apache-2.0) and its
VS Code extension scaffold (`apps/vscode`, MIT). Those upstream license and copyright
notices are preserved. JSONL Vision is an independent project and is not affiliated
with or endorsed by JSON Crack.

## Development

This extension lives in `apps/vscode` inside the vendored `jsoncrack.com` monorepo.

**Prerequisites:** Node.js `>=20`, pnpm `>=10`

**Stack:** Vite (webview) + esbuild (extension host) + React 19

```sh
# Install dependencies from repo root
pnpm install

# Build the extension
cd apps/vscode
pnpm run build
```

### Debugging

1. Open the **monorepo root** in VS Code.
2. Press **F5** to launch the "Run VSCode Extension" config — it builds and opens the Extension Development Host.
3. After making changes, press `Cmd+R` (macOS) / `Ctrl+R` (Windows/Linux) in the host window to reload.

### Scripts

| Script | Description |
|---|---|
| `build` | Production build (minified, no sourcemaps) |
| `build:dev` | Dev build (sourcemaps, no minification) |
| `watch` | Watch extension host (`ext-src/`) for changes |
| `watch:webview` | Watch webview (`src/`) for changes |
| `dev` | Start Vite dev server (standalone webview in browser) |
| `lint` | Run ESLint + Prettier check |
| `clean` | Remove `build/` directory |
