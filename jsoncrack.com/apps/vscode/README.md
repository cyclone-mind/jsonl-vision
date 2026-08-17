# JSONL Vision

Read and edit **JSONL / NDJSON** files one line at a time. Put the cursor on a line and
that record opens as an interactive, warm-themed node graph — objects, arrays, and
values as a connected diagram you can navigate and edit in place.

[Install from the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=cyclone-mind.jsonl-vision)
or run `code --install-extension cyclone-mind.jsonl-vision`.

## Features

- **Per-line** — each line is its own graph in its own tab; move the cursor to open the
  next one. Right-click a tab to close left / right / others.
- **Inline editing** — double-click a scalar value; the edit is written straight back to
  the file.
- **Readable** — depth-colored node headers, orthogonal connectors, inline color
  swatches, collapsible objects, and complete wrapped display of long strings on a
  dotted canvas.
- **`.json` too** — plain `.json` files open in whole-document graph mode.
- **Offline** — all parsing, rendering, and write-back happen locally.

## Usage

1. Open a `.jsonl`, `.ndjson`, `.jsonlines`, or `.json` file.
2. Click the **JSONL Vision** button in the editor title bar (top right).
3. Move the cursor between lines to open a tab per line; double-click a value to edit it.

## Settings

| Setting                   | Values                   | Default | Description                                                                                                                    |
| ------------------------- | ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `jsonl-vision.background` | `auto` · `dark` · `warm` | `auto`  | Canvas background: follow the VS Code theme, warm dark (charcoal), or warm light (cream). Applies when a panel is next opened. |

## Privacy

Works **fully offline** — no data is sent anywhere.

## Credits

Built on the open-source graph engine from [JSON Crack](https://jsoncrack.com)
(`packages/jsoncrack-react`, Apache-2.0) and its VS Code scaffold (`apps/vscode`, MIT),
with upstream license and copyright notices preserved (see `NOTICE.md`). JSONL Vision is
an independent project, not affiliated with or endorsed by JSON Crack.

## Development

Lives in `apps/vscode` inside the vendored `jsoncrack.com` monorepo.
**Prerequisites:** Node.js `>=24`, pnpm `>=10`. **Stack:** Vite (webview) + esbuild
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

| Script                    | Description                                       |
| ------------------------- | ------------------------------------------------- |
| `build` / `build:dev`     | Production / dev build                            |
| `watch` / `watch:webview` | Watch host / webview                              |
| `dev`                     | Vite dev server (standalone webview in a browser) |
| `lint`                    | ESLint + Prettier                                 |

## Manual release (Windows PowerShell)

Marketplace versions are immutable, so first raise `version` in `apps/vscode/package.json`
(for example `0.1.0` → `0.1.1`). Then run:

```powershell
cd C:\path\to\Good_JSONL\jsoncrack.com
pnpm install --frozen-lockfile
pnpm --filter jsoncrack-react test
pnpm build:vscode

cd apps\vscode
.\node_modules\.bin\vsce.cmd login cyclone-mind
pnpm run vsc:package

# Optional local smoke install before publishing:
code --install-extension .\jsonl-vision-0.1.1.vsix

# Publish the exact package that was smoke-tested:
.\node_modules\.bin\vsce.cmd publish --packagePath .\jsonl-vision-0.1.1.vsix

# Confirm the public Marketplace metadata/version:
.\node_modules\.bin\vsce.cmd show cyclone-mind.jsonl-vision --json
```

Enter the Marketplace PAT only in the hidden `vsce login` prompt; never put it in a
command, source file, or chat message. The extension page can take a few minutes to
appear after the publish command succeeds.
