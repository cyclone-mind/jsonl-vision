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

## Release

Push a tag `vX.Y.Z` that matches `version` in `apps/vscode/package.json` (for this
release, `v0.2.0`). [`.github/workflows/release.yml`](../../../.github/workflows/release.yml)
builds one `.vsix`, publishes it to the VS Code Marketplace with Trusted Publishing
(`vsce publish --oidc`, no `VSCE_PAT`; the job needs `id-token: write` and must not
set a GitHub environment) and to Open VSX (`OVSX_PAT`), and attaches it to the
GitHub release. A missing `OVSX_PAT` skips Open VSX with a warning. Open VSX also
needs the Eclipse publisher agreement and, once, `npx ovsx create-namespace cyclone-mind`
to claim the `cyclone-mind` namespace. The root README "Release" section has the
details. Do not create the tag from this doc's examples until that version is the
one on `main`.

## Manual release (Windows PowerShell)

Use this only when the tag workflow cannot run. Marketplace versions are immutable,
so first raise `version` in `apps/vscode/package.json`. Then run:

```powershell
cd C:\path\to\Good_JSONL\jsoncrack.com
pnpm install --frozen-lockfile
pnpm --filter jsoncrack-react test
pnpm build:vscode

cd apps\vscode
.\node_modules\.bin\vsce.cmd login cyclone-mind
pnpm run vsc:package

# Optional local smoke install before publishing:
code --install-extension .\jsonl-vision-0.2.0.vsix

# Publish the exact package that was smoke-tested:
.\node_modules\.bin\vsce.cmd publish --packagePath .\jsonl-vision-0.2.0.vsix

# Open VSX, after the Eclipse publisher agreement is signed and the namespace exists.
# OVSX_PAT must already be in the environment; do not paste it into the command.
npx ovsx publish --packagePath .\jsonl-vision-0.2.0.vsix

# Confirm the public Marketplace metadata/version:
.\node_modules\.bin\vsce.cmd show cyclone-mind.jsonl-vision --json
```

Enter the Marketplace PAT only in the hidden `vsce login` prompt; never put it in a
command, source file, or chat message. The extension page can take a few minutes to
appear after the publish command succeeds.
