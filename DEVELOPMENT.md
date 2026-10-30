# Development

From-scratch VS Code extension notes (accounts, `yo code`, Marketplace, the
pitfalls this repo hit): [`docs/develop-vscode-extension.md`](docs/develop-vscode-extension.md).

The extension is the repository root. The graph engine is the workspace package
`packages/jsoncrack-react`.
**Prerequisites:** Node.js `>=24`, pnpm `10.20.0`. **Stack:** Vite (webview) + esbuild
(host) + React 19.

```sh
pnpm install              # from the repository root
pnpm run build            # builds packages/jsoncrack-react, then the webview and host
pnpm run vsc:package      # production build, then the .vsix
```

`pnpm run build` builds `jsoncrack-react` first, because the webview imports
that package's `dist`.

Debugging: open this repository in VS Code and press **F5** ("Run VSCode
Extension") to launch the Extension Development Host; reload it with `Ctrl+R` / `Cmd+R`
after changes.

| Script                    | Description                                       |
| ------------------------- | ------------------------------------------------- |
| `build` / `build:dev`     | Build the graph package, then the extension       |
| `watch` / `watch:webview` | Watch host / webview                              |
| `dev`                     | Vite dev server (standalone webview in a browser) |
| `test`                    | Graph-engine tests, then extension unit tests     |
| `lint`                    | Graph-engine lint, then ESLint + Prettier         |

## Release

Push a tag `vX.Y.Z` that matches `version` in the root `package.json`.
[`.github/workflows/release.yml`](.github/workflows/release.yml)
builds one `.vsix`, publishes it to the VS Code Marketplace with Trusted Publishing
(`vsce publish --oidc`, no `VSCE_PAT`; the job needs `id-token: write` and must not
set a GitHub environment) and to Open VSX (`OVSX_PAT`), and attaches it to the
GitHub release. The workflow filename stays `release.yml` because the Marketplace
Trusted Publishing policy is bound to that file. A missing `OVSX_PAT` skips Open VSX
with a warning. Open VSX also needs the Eclipse publisher agreement and, once,
`npx ovsx create-namespace cyclone-mind` to claim the `cyclone-mind` namespace.
The root README "Release" section has the details. Do not create the tag from this
doc's examples until that version is the one on `main`.

## Manual release (Windows PowerShell)

Use this only when the tag workflow cannot run. Marketplace versions are immutable,
so first raise `version` in `package.json`. Then, from the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm run lint
pnpm run vsc:package

.\node_modules\.bin\vsce.cmd login cyclone-mind

# Optional local smoke install before publishing. Use the version you just packaged.
code --install-extension .\jsonl-vision-<version>.vsix

# Publish the exact package that was smoke-tested:
.\node_modules\.bin\vsce.cmd publish --packagePath .\jsonl-vision-<version>.vsix

# Open VSX, after the Eclipse publisher agreement is signed and the namespace exists.
# OVSX_PAT must already be in the environment; do not paste it into the command.
npx ovsx publish --packagePath .\jsonl-vision-<version>.vsix

# Confirm the public Marketplace metadata/version:
.\node_modules\.bin\vsce.cmd show cyclone-mind.jsonl-vision --json
```

Enter the Marketplace PAT only in the hidden `vsce login` prompt; never put it in a
command, source file, or chat message. The extension page can take a few minutes to
appear after the publish command succeeds.
