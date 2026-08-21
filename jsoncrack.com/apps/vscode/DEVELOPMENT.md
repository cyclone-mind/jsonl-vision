# Development

From-scratch VS Code extension notes (accounts, `yo code`, Marketplace, the
pitfalls this repo hit): [`docs/develop-vscode-extension.md`](../../../docs/develop-vscode-extension.md).

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
(for example `0.1.1` → `0.1.2`). Then run:

```powershell
cd C:\path\to\Good_JSONL\jsoncrack.com
pnpm install --frozen-lockfile
pnpm --filter jsoncrack-react test
pnpm build:vscode

cd apps\vscode
.\node_modules\.bin\vsce.cmd login cyclone-mind
pnpm run vsc:package

# Optional local smoke install before publishing:
code --install-extension .\jsonl-vision-0.1.2.vsix

# Publish the exact package that was smoke-tested:
.\node_modules\.bin\vsce.cmd publish --packagePath .\jsonl-vision-0.1.2.vsix

# Confirm the public Marketplace metadata/version:
.\node_modules\.bin\vsce.cmd show cyclone-mind.jsonl-vision --json
```

Enter the Marketplace PAT only in the hidden `vsce login` prompt; never put it in a
command, source file, or chat message. The extension page can take a few minutes to
appear after the publish command succeeds.
