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
- **Agent session logs** — Claude Code and Codex CLI transcripts open as a readable session view. See below.

## Usage

1. Open a `.jsonl`, `.ndjson`, `.jsonlines`, or `.json` file.
2. Click the **JSONL Vision** button in the editor title bar (top right).
3. Move the cursor between lines to open a tab per line; double-click a value to edit it.

## Agent session logs

Claude Code writes one JSON object per line under `~/.claude/projects/<project>/<session>.jsonl`. Codex CLI writes rollout files under `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Message text, tool arguments, and tool output are often buried in nested JSON strings, so the raw graph is hard to scan.

JSONL Vision sniffs the first lines of a JSONL file. When they match those schemas it opens **agent session mode**:

- Each record is labeled **user**, **assistant**, **tool call**, **tool result**, or **meta**, with a colored bar and a short summary (role plus the first words, or the tool name).
- A tool call shows its name and input. A nearby tool result is inlined on that node, and a result line shows the tool name and input it answers. Pairing uses Claude `tool_use` / `tool_use_id` and Codex `call_id`.
- String fields that contain a JSON object or array become nested nodes.
- Previous and next record buttons (Alt+Left / Alt+Right) move to the neighboring non-empty line.
- Open tabs show a short hint such as `3 · Read`.

Edits still write back to that line. A value inside a parsed JSON string is written back into the string. A value copied from the paired line, a session-view label, or a shortened long string is read-only, so the file is not corrupted. Turn the mode off to graph and edit the raw record.

**JSONL Vision: Toggle Agent Session Mode** forces the mode on or off for the file you have open. That override lasts until you toggle again or close the panel.

### Known limitations

- Detection reads only the first 40 non-empty lines. A session whose markers start later is not auto-detected; use the toggle.
- Pairing looks at the nearest 80 records in one direction and skips a line longer than 64KB. A result far from its call is shown without its pair. Output larger than about 24KB is not copied onto the call.
- Streaming-split Claude replies stay one graph per line. Subagent files and resumed Codex rollouts are not joined across files.
- The view omits bulky bookkeeping (token usage, `base_instructions`, ancestry ids). Those fields stay in the file and show in raw mode.
- Strings longer than 12,000 characters are previewed and are not editable until you turn the mode off. JSON strings are expanded only when they are an object or array under about 80KB and 150 containers.
- A scalar edit re-serializes the line with compact `JSON.stringify`, including a JSON string you changed. Other fields' values are preserved.
- `.json` files stay in whole-document mode. Ordinary JSONL is unchanged when it does not match these schemas and you have not toggled the mode on.

## Settings

| Setting                              | Values                   | Default | Description                                                                                                                                                          |
| ------------------------------------ | ------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jsonl-vision.background`            | `auto` · `dark` · `warm` | `auto`  | Canvas background: follow the VS Code theme, warm dark (charcoal), or warm light (cream). Open panels update immediately.                                            |
| `jsonl-vision.detectAgentSessions`   | `true` · `false`         | `true`  | Sniff Claude Code and Codex CLI session logs and open them in agent session mode. Turn off to always graph raw JSONL. The toggle command still switches the open file. |

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

The VS Code Marketplace step uses Trusted Publishing (`vsce publish --oidc`).
Publisher `cyclone-mind` policy `jsonl-vision release` trusts this repository's
`release.yml` workflow with no GitHub environment, so the workflow does not use
`VSCE_PAT`. Do not add a job `environment:` or the OIDC subject will not match.

Open VSX still needs a token. Add this repository secret
([Actions secrets](https://github.com/cyclone-mind/jsonl-vision/settings/secrets/actions)):

| Secret     | Registry                                                                          |
| ---------- | --------------------------------------------------------------------------------- |
| `OVSX_PAT` | Open VSX access token. `npx ovsx publish` reads it from the environment.         |

If `OVSX_PAT` is missing, Open VSX publish logs a warning and is skipped. The
Marketplace publish and the GitHub release still run.

Open VSX also requires, once per publisher:

1. Sign the Eclipse publisher agreement (Open VSX prompts for this on the account).
2. Claim the namespace: `npx ovsx create-namespace cyclone-mind` (uses `OVSX_PAT`).

The `cyclone-mind` namespace must be claimed before the first Open VSX publish.
The Open VSX page is empty until that publish succeeds.

Changelog: [CHANGELOG.md](CHANGELOG.md).
