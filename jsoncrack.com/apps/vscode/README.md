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

## Usage

1. Open a `.jsonl`, `.ndjson`, `.jsonlines`, or `.json` file.
2. Click the **JSONL Vision** button in the editor title bar (top right).
3. Move the cursor between lines to open a tab per line; double-click a value to edit it.

## Settings

| Setting                   | Values                   | Default | Description                                                                                                       |
| ------------------------- | ------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `jsonl-vision.background` | `auto` · `dark` · `warm` | `auto`  | Canvas background: follow the VS Code theme, warm dark (charcoal), or warm light (cream). Open panels update immediately. |

## Privacy

Works **fully offline** — no data is sent anywhere.

## Credits

Built on the open-source graph engine from [JSON Crack](https://jsoncrack.com)
(`packages/jsoncrack-react`, Apache-2.0) and its VS Code scaffold (`apps/vscode`, MIT),
with upstream license and copyright notices preserved (see `NOTICE.md`). JSONL Vision is
an independent project, not affiliated with or endorsed by JSON Crack.

## Release

Maintainers publish by pushing a git tag that matches `version` in this
`package.json`. The tag `v0.2.0` runs
[`.github/workflows/release.yml`](https://github.com/cyclone-mind/jsonl-vision/blob/main/.github/workflows/release.yml):
it builds one `.vsix`, publishes that file, and attaches it to the GitHub release.
This workflow does not create the tag.

Add these repository secrets before the first tagged release
([Actions secrets](https://github.com/cyclone-mind/jsonl-vision/settings/secrets/actions)):

| Secret     | Registry                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| `VSCE_PAT` | VS Code Marketplace. Azure DevOps personal access token with **Marketplace → Manage** (all accessible organizations). `vsce publish` reads it from the environment. |
| `OVSX_PAT` | Open VSX access token. `npx ovsx publish` reads it from the environment.                                     |

If a secret is missing, that publish logs a warning and is skipped. The other
registry and the GitHub release still run.

Open VSX also requires, once per publisher:

1. Sign the Eclipse publisher agreement (Open VSX prompts for this on the account).
2. Create the namespace: `npx ovsx create-namespace cyclone-mind` (uses `OVSX_PAT`).

The `cyclone-mind` namespace must exist before the first Open VSX publish. The
Open VSX page is empty until that publish succeeds.

Changelog: [CHANGELOG.md](CHANGELOG.md).
