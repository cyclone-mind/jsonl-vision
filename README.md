# JSONL Vision

Graph and edit one record of a JSONL, NDJSON, or JSON Lines file — a JSON Crack-style node graph, in the editor.

[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=cyclone-mind.jsonl-vision)
·
[Open VSX](https://open-vsx.org/extension/cyclone-mind/jsonl-vision)

VS Code installs from the Marketplace. Cursor, Windsurf, and VSCodium users install from Open VSX.

```sh
code --install-extension cyclone-mind.jsonl-vision
```

<!-- TODO: replace the note below with a demo GIF at an https URL. Show a JSONL line opening as a graph, the cursor moving to another record, and a value edit written back. The Marketplace does not render relative paths or SVG. -->

> **Demo:** GIF placeholder — recording not added yet.

## Features

- **Per-line graph** — each JSONL, NDJSON, or JSON Lines record opens as its own tab.
- **Edit values** — double-click a scalar; the change is written back to that line. Edits that would corrupt the line are rejected.
- **Cursor stays in sync** — the graph tab and the editor cursor follow the same record, including when lines above it are inserted or deleted.
- **Clear failures** — invalid, too-deep, or oversized JSON explains why it was not graphed.
- **JSON Crack-style canvas** — depth-colored headers, orthogonal connectors, collapsible objects, warm dark or cream theme.
- **`.json` too** — a plain JSON file opens as one whole-file graph.
- **Offline** — parsing and write-back stay in the editor.

Changelog: [`jsoncrack.com/apps/vscode/CHANGELOG.md`](jsoncrack.com/apps/vscode/CHANGELOG.md).

## Release

Maintainers publish by pushing a git tag that matches `version` in
[`jsoncrack.com/apps/vscode/package.json`](jsoncrack.com/apps/vscode/package.json).
The tag `v0.2.0` runs [`.github/workflows/release.yml`](.github/workflows/release.yml):
it builds one `.vsix`, publishes that file, and attaches it to the GitHub release.
Do not create the tag until that version is on `main`. The workflow does not publish
anything on its own until the tag is pushed, and it does not create the tag.

The VS Code Marketplace step uses [Trusted Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing):
`npx @vscode/vsce publish --packagePath <vsix> --oidc`. Publisher `cyclone-mind`
policy `jsonl-vision release` trusts GitHub Actions in this repository, workflow
`release.yml`, with no GitHub environment. The job has `id-token: write` and
does not read `VSCE_PAT`. Do not add a job `environment:` — the policy's
environment is empty, and a name would change the OIDC subject. On a private
repository, the first successful token exchange has to happen within 48 hours
of creating the policy or the policy does not stay active.

Open VSX is still token-based. Add this repository secret before the first
Open VSX publish
([Settings → Secrets and variables → Actions](https://github.com/cyclone-mind/jsonl-vision/settings/secrets/actions)):

| Secret     | Registry                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `OVSX_PAT` | Open VSX access token from [open-vsx.org tokens](https://open-vsx.org/user-settings/tokens). `npx ovsx publish` reads it from the environment. |

If `OVSX_PAT` is missing, Open VSX publish logs a warning and is skipped. The
Marketplace publish and the GitHub release still run.

Open VSX also requires, once per publisher:

1. Sign the Eclipse publisher agreement (Open VSX prompts for this on the account).
2. Claim the namespace: `npx ovsx create-namespace cyclone-mind` (uses `OVSX_PAT`).

The `cyclone-mind` namespace must be claimed before the first Open VSX publish.
The listing at the Open VSX link above is empty until that publish succeeds.

The extension id on both registries is `cyclone-mind.jsonl-vision`.

### Local `.vsix`

```sh
cd jsoncrack.com
pnpm install --frozen-lockfile
pnpm --filter jsoncrack-react run build
pnpm --filter jsonl-vision run vsc:package
code --install-extension apps/vscode/jsonl-vision-0.2.0.vsix
```

## Layout

The upstream [JSON Crack](https://jsoncrack.com) monorepo is vendored under
[`jsoncrack.com/`](jsoncrack.com/). The parts that matter here:

- [`jsoncrack.com/apps/vscode`](jsoncrack.com/apps/vscode) — the extension (host + webview).
- [`jsoncrack.com/packages/jsoncrack-react`](jsoncrack.com/packages/jsoncrack-react) — the graph engine.
- [`docs/adr/0001-jsonl-vision-architecture.md`](docs/adr/0001-jsonl-vision-architecture.md) — the design decisions and why.

From-scratch guide (scaffold → debug → Marketplace):
[`docs/develop-vscode-extension.md`](docs/develop-vscode-extension.md).

This repo's build and release commands:
[`jsoncrack.com/apps/vscode/DEVELOPMENT.md`](jsoncrack.com/apps/vscode/DEVELOPMENT.md).

## Credits & license

Built on the open-source [JSON Crack](https://jsoncrack.com) engine
(`packages/jsoncrack-react`, Apache-2.0) and its VS Code scaffold (`apps/vscode`, MIT),
both vendored with their license and copyright notices preserved. JSONL Vision is an
independent project, not affiliated with or endorsed by JSON Crack. See
[`NOTICE.md`](jsoncrack.com/apps/vscode/NOTICE.md).
