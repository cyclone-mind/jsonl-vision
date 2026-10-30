import * as path from "path";
import * as vscode from "vscode";
import type { AgentFamily } from "./agentSessionDetect";
import { detectAgentSession } from "./agentSessionDetect";
import {
  describeSessionEditFailure,
  editRecord,
  presentSessionLine,
  sessionTabHint,
} from "./agentSessionView";
import type { PathSegment, Scalar } from "./applyEdit";
import { graphPayload } from "./jsonGuard";
import { adjacentNonEmptyLine, focusLineDecision } from "./lineFocus";
import { findLineContaining, parseGoToLine } from "./lineSearch";
import type { TextChange } from "./lineShift";
import { shiftLineNumber } from "./lineShift";
import type { LineTabsAction, LineTabsState } from "./lineTabs";
import { applyLineShifts, createState, reduce } from "./lineTabs";
import { describeEditFailure, normalizeDocumentLine, readScalarEdit } from "./lineText";
import { createWebviewPanel } from "./webview";

const JSONL_EXTENSIONS = new Set([".jsonl", ".ndjson", ".jsonlines"]);

/** Whether a document should use the per-line JSONL flow instead of whole-document mode. */
export function isJsonlDocument(document: vscode.TextDocument): boolean {
  const ext = path.extname(document.fileName).toLowerCase();
  if (JSONL_EXTENSIONS.has(ext)) return true;
  return document.languageId === "jsonl";
}

// One line-tracking session per file. Re-invoking the command for a file that is
// already tracked reveals its existing panel rather than opening a second one
// (ADR item 5: one panel per file, re-visiting focuses the existing one).
const sessions = new Map<string, LineTrackingSession>();

export function startLineTracking(context: vscode.ExtensionContext, editor: vscode.TextEditor) {
  const key = editor.document.uri.toString();
  const existing = sessions.get(key);
  if (existing) {
    existing.reveal();
    existing.focusLine(editor.selection.active.line);
    return;
  }
  const session = new LineTrackingSession(context, editor, () => sessions.delete(key));
  sessions.set(key, session);
}

/** Ask for a 1-based line and open that JSONL record. */
export async function goToJsonlLine(context: vscode.ExtensionContext, editor?: vscode.TextEditor) {
  const active = [...sessions.values()].find(session => session.isPanelActive());
  const target =
    active?.editorDocument() ??
    (editor && isJsonlDocument(editor.document)
      ? editor.document
      : vscode.window.visibleTextEditors.find(item => isJsonlDocument(item.document))?.document);
  if (!target) {
    void vscode.window.showInformationMessage("Open a JSONL file to go to a line.");
    return;
  }
  const picked = await vscode.window.showInputBox({
    title: "Go to Line",
    prompt: "Line number",
    placeHolder: "1",
    validateInput: value => {
      const parsed = parseGoToLine(value, target.lineCount);
      return parsed.ok ? undefined : parsed.message;
    },
  });
  if (picked == null) return;
  const parsed = parseGoToLine(picked, target.lineCount);
  if (!parsed.ok) return;
  const visible = vscode.window.visibleTextEditors.find(item => item.document === target);
  if (visible) startLineTracking(context, visible);
  else {
    const shown = await vscode.window.showTextDocument(target, { preview: false });
    startLineTracking(context, shown);
  }
  sessions.get(target.uri.toString())?.goToLine(parsed.line);
}

/** Toggle agent session mode for the open panel, or for the JSONL editor in front. */
export function toggleAgentSession(context: vscode.ExtensionContext, editor?: vscode.TextEditor) {
  for (const session of sessions.values()) {
    if (session.isPanelActive()) {
      session.reveal();
      session.toggleAgentMode();
      return;
    }
  }

  const target =
    editor && isJsonlDocument(editor.document)
      ? editor
      : vscode.window.visibleTextEditors.find(item => isJsonlDocument(item.document));
  if (!target) {
    void vscode.window.showInformationMessage("Open a JSONL file to toggle agent session mode.");
    return;
  }
  startLineTracking(context, target);
  sessions.get(target.document.uri.toString())?.toggleAgentMode();
}

/**
 * Owns the webview panel and the line-anchored tab state for a single JSONL file.
 * The pure transitions live in ./lineTabs; this class is the thin vscode-facing
 * shell that turns editor/document events into actions and posts state to the webview.
 */
class LineTrackingSession {
  private readonly panel: vscode.WebviewPanel;
  private readonly document: vscode.TextDocument;
  private state: LineTabsState = createState();
  private readonly disposables: vscode.Disposable[] = [];
  private webviewReady = false;
  private lastFocusedLine: number | null = null;
  /** null follows auto-detect. true/false is a manual override for this panel. */
  private manual: boolean | null = null;
  private detected: AgentFamily | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    editor: vscode.TextEditor,
    private readonly onDisposed: () => void
  ) {
    this.document = editor.document;
    const title = `JSONL Vision — ${path.basename(this.document.fileName)}`;
    this.panel = createWebviewPanel(context, title, () => ({
      fileName: path.basename(this.document.fileName),
      directory: path.dirname(this.document.fileName),
      line: this.state.focusedLine,
    }));

    this.panel.webview.onDidReceiveMessage(
      msg => this.onWebviewMessage(msg),
      null,
      this.disposables
    );

    vscode.window.onDidChangeTextEditorSelection(
      e => {
        if (e.textEditor.document !== this.document) return;
        this.focusLine(e.selections[0].active.line);
      },
      null,
      this.disposables
    );

    vscode.workspace.onDidChangeTextDocument(
      e => {
        if (e.document !== this.document) return;
        this.reconcileDocument(e.contentChanges);
      },
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    vscode.workspace.onDidChangeConfiguration(
      event => {
        if (!event.affectsConfiguration("jsonl-vision.detectAgentSessions")) return;
        this.sniff();
        this.post();
      },
      null,
      this.disposables
    );

    this.sniff();
    // Focus the line the cursor is already on when tracking starts.
    this.focusLine(editor.selection.active.line);
  }

  isPanelActive(): boolean {
    return this.panel.active;
  }

  editorDocument(): vscode.TextDocument {
    return this.document;
  }

  /** Move the editor and the graph to a 0-based line. Blank lines are revealed but not graphed. */
  goToLine(line: number) {
    const text = this.lineText(line);
    if (text.trim() === "") {
      void vscode.window.showInformationMessage(`Line ${line + 1} is blank.`);
    } else {
      this.focusLine(line);
    }
    this.revealLine(line);
  }

  /** Flip agent session mode for this file without changing the global setting. */
  toggleAgentMode() {
    this.manual = this.isAgentModeOn() ? false : true;
    this.post();
  }

  reveal() {
    this.panel.reveal(vscode.ViewColumn.Beside);
  }

  /** Move focus to a line, opening a tab for it if needed. Blank lines are ignored. */
  focusLine(line: number) {
    const content = this.lineText(line);
    const decision = focusLineDecision({
      line,
      content,
      lastFocusedLine: this.lastFocusedLine,
      focusedLine: this.state.focusedLine,
      openLines: this.state.tabs.map(tab => tab.line),
    });
    if (decision !== "focus") return;
    this.lastFocusedLine = line;
    this.dispatch({ type: "FOCUS_LINE", line, content });
  }

  private onWebviewMessage(msg: unknown) {
    if (msg === "ready") {
      this.webviewReady = true;
      this.post();
      return;
    }
    if (!msg || typeof msg !== "object") return;
    const m = msg as {
      type?: string;
      line?: number;
      path?: PathSegment[];
      value?: Scalar;
    };

    // A scalar edit targets the focused line, not a tab id. `readScalarEdit`
    // rejects a missing or non-finite value instead of storing it as null.
    const edit = readScalarEdit(msg);
    if (m.type === "editValue") {
      if (edit && this.state.focusedLine !== null) {
        void this.applyEdit(this.state.focusedLine, edit.path, edit.value);
      }
      return;
    }

    if (m.type === "toggleAgentSession") {
      this.toggleAgentMode();
      return;
    }

    if (m.type === "navigate") {
      const direction = (msg as { direction?: string }).direction;
      if (direction === "prev" || direction === "next") {
        this.navigate(direction === "next" ? 1 : -1);
      }
      return;
    }

    if (m.type === "findLine") {
      const query = (msg as { query?: unknown }).query;
      const direction = (msg as { direction?: string }).direction;
      if (typeof query === "string" && (direction === "prev" || direction === "next")) {
        this.findLine(query, direction === "next" ? 1 : -1);
      }
      return;
    }

    if (typeof m.line !== "number") return;
    switch (m.type) {
      case "clickTab":
        this.dispatch({ type: "CLICK_TAB", line: m.line });
        // Remember this line before moving the editor cursor. The selection
        // event that follows calls focusLine, which must see the tab as
        // already focused instead of opening a second path onto it.
        this.lastFocusedLine = m.line;
        this.revealLine(m.line);
        break;
      case "closeTab":
        this.dispatch({ type: "CLOSE_TAB", line: m.line });
        break;
      case "closeTabsLeft":
        this.dispatch({ type: "CLOSE_TABS", line: m.line, scope: "left" });
        break;
      case "closeTabsRight":
        this.dispatch({ type: "CLOSE_TABS", line: m.line, scope: "right" });
        break;
      case "closeOtherTabs":
        this.dispatch({ type: "CLOSE_TABS", line: m.line, scope: "others" });
        break;
      case "refreshTab":
        this.dispatch({ type: "REFRESH_TAB", line: m.line, content: this.lineText(m.line) });
        break;
    }
  }

  /** Apply a committed scalar edit to a line and write it straight back (ADR items 5-7). */
  private async applyEdit(line: number, editPath: PathSegment[], value: Scalar) {
    const original = this.lineText(line);
    const family = this.agentFamily();
    const result = editRecord(
      original,
      editPath,
      value,
      family
        ? { family, before: this.neighborLines(line, -1), after: this.neighborLines(line, 1) }
        : null
    );
    if (!result.ok) {
      const message = family
        ? describeSessionEditFailure(result.reason)
        : describeEditFailure(result.reason as "invalid-json" | "bad-path" | "bad-value");
      void vscode.window.showWarningMessage(message);
      return;
    }
    if (result.text === original) return;

    const edit = new vscode.WorkspaceEdit();
    edit.replace(this.document.uri, this.document.lineAt(line).range, result.text);
    await vscode.workspace.applyEdit(edit);
    // The resulting onDidChangeTextDocument reconcile re-syncs the focused tab's
    // snapshot and re-posts the graph, so no extra dispatch is needed here.
  }

  /**
   * After a document edit, move anchors by the line delta, then re-check each
   * surviving tab for drift (or live-sync the focused one). `contentChanges`
   * describe the pre-edit document, which is also what `shiftLineNumber` expects.
   * The document event is handled before any selection event from the same
   * keystroke, so the cursor line observed afterwards is already in post-edit
   * coordinates.
   */
  private reconcileDocument(changes: readonly vscode.TextDocumentContentChangeEvent[]) {
    const mapped: TextChange[] = changes.map(change => ({
      startLine: change.range.start.line,
      startChar: change.range.start.character,
      endLine: change.range.end.line,
      endChar: change.range.end.character,
      text: change.text,
    }));

    const headTouched = mapped.some(change => change.startLine < 80 || change.endLine < 80);
    let detectedChanged = false;
    if (headTouched) {
      const before = this.detected;
      this.sniff();
      detectedChanged = before !== this.detected;
    }

    const shifted = applyLineShifts(this.state, mapped);
    const nextCursorLine =
      this.lastFocusedLine === null ? null : shiftLineNumber(this.lastFocusedLine, mapped);
    let changed =
      detectedChanged || shifted !== this.state || nextCursorLine !== this.lastFocusedLine;
    this.state = shifted;
    this.lastFocusedLine = nextCursorLine;

    for (const tab of [...this.state.tabs]) {
      const next = reduce(this.state, {
        type: "LINE_CHANGED",
        line: tab.line,
        content: this.lineText(tab.line),
      });
      if (next !== this.state) {
        this.state = next;
        changed = true;
      }
    }
    if (changed) this.post();
  }

  private dispatch(action: LineTabsAction) {
    const next = reduce(this.state, action);
    if (next === this.state) return;
    this.state = next;
    this.post();
  }

  /**
   * Put the editor cursor on `line` so the graph tab and the text cursor stay
   * on the same record. Visible editors are updated in place; a hidden
   * document is shown without stealing focus from the webview.
   */
  private revealLine(line: number) {
    const visible = vscode.window.visibleTextEditors.find(
      editor => editor.document === this.document
    );
    if (visible) {
      this.moveCursor(visible, line);
      return;
    }
    void vscode.window
      .showTextDocument(this.document, { preserveFocus: true, preview: false })
      .then(
        editor => this.moveCursor(editor, line),
        () => undefined
      );
  }

  private moveCursor(editor: vscode.TextEditor, line: number) {
    if (editor.document !== this.document) return;
    const last = Math.max(0, editor.document.lineCount - 1);
    const target = Math.min(Math.max(line, 0), last);
    if (editor.selection.active.line === target) return;
    const position = new vscode.Position(target, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
  }

  /** Current text at a line, or "" if the line no longer exists (e.g. deleted). */
  private lineText(line: number): string {
    if (line < 0 || line >= this.document.lineCount) return "";
    return normalizeDocumentLine(line, this.document.lineAt(line).text);
  }

  private post() {
    if (!this.webviewReady) return;
    const focusedText =
      this.state.focusedLine === null ? "" : this.lineText(this.state.focusedLine);
    const family = this.agentFamily();
    const payload = this.sessionPayload(focusedText, family);
    this.panel.webview.postMessage({
      json: payload.json,
      problem: payload.problem,
      tabs: this.state.tabs.map(tab => this.postedTab(tab.line, tab.drift, family, focusedText)),
      focusedLine: this.state.focusedLine,
      session: payload.session,
      record: this.recordNav(),
    });
  }

  private recordNav() {
    const line = this.state.focusedLine;
    return {
      line,
      lineCount: this.document.lineCount,
      canPrev:
        line !== null &&
        adjacentNonEmptyLine(line, -1, this.document.lineCount, current =>
          this.lineText(current)
        ) !== null,
      canNext:
        line !== null &&
        adjacentNonEmptyLine(line, 1, this.document.lineCount, current =>
          this.lineText(current)
        ) !== null,
    };
  }

  private findLine(query: string, direction: 1 | -1) {
    const from = this.state.focusedLine ?? (direction === 1 ? -1 : this.document.lineCount);
    const found = findLineContaining(from, direction, this.document.lineCount, query, line =>
      this.lineText(line)
    );
    if (found === null) {
      const trimmed = query.trim();
      void vscode.window.showInformationMessage(
        trimmed
          ? `No other line contains “${trimmed}”.`
          : "Type a search before looking through lines."
      );
      return;
    }
    this.focusLine(found);
    this.revealLine(found);
  }

  private postedTab(
    line: number,
    drift: boolean,
    family: AgentFamily | "generic" | null,
    focusedText: string
  ) {
    const posted: { line: number; drift: boolean; label?: string; role?: string } = { line, drift };
    if (!family) return posted;
    const text = line === this.state.focusedLine ? focusedText : this.lineText(line);
    const hint = sessionTabHint(text, family);
    if (!hint) return posted;
    posted.label = `${line + 1} · ${hint.hint}`;
    posted.role = hint.role;
    return posted;
  }

  private sessionPayload(focusedText: string, family: AgentFamily | "generic" | null) {
    const raw = graphPayload(focusedText, "line");
    if (!family) {
      if (this.manual === false && this.detected) {
        return {
          ...raw,
          session: this.sessionChrome({
            enabled: false,
            resume: true,
            family: this.detected,
            role: "meta",
            roleLabel: "meta",
            summary: "Agent session mode is off",
            lockedPaths: [],
          }),
        };
      }
      return { ...raw, session: null };
    }

    const line = this.state.focusedLine;
    if (line === null || focusedText.trim() === "") {
      return {
        json: raw.json,
        problem: raw.problem,
        session: this.sessionChrome({
          enabled: true,
          resume: false,
          family,
          role: "meta",
          roleLabel: "meta",
          summary: "No record",
          lockedPaths: [],
        }),
      };
    }

    let view: ReturnType<typeof presentSessionLine>;
    try {
      view = presentSessionLine(focusedText, family, {
        before: this.neighborLines(line, -1),
        after: this.neighborLines(line, 1),
      });
    } catch {
      view = null;
    }
    if (!view) {
      return {
        ...raw,
        session: this.sessionChrome({
          enabled: true,
          resume: false,
          family,
          role: "meta",
          roleLabel: "meta",
          summary: raw.problem ? "invalid JSON" : "record",
          lockedPaths: [],
        }),
      };
    }

    const guarded = graphPayload(view.displayJson, "line");
    return {
      json: guarded.json,
      problem: guarded.problem,
      session: this.sessionChrome({
        enabled: true,
        resume: false,
        family,
        role: view.role,
        roleLabel: view.roleLabel,
        summary: view.summary,
        lockedPaths: view.locks.map(lock => lock.path),
      }),
    };
  }

  private sessionChrome(input: {
    enabled: boolean;
    resume: boolean;
    family: AgentFamily | "generic";
    role: string;
    roleLabel: string;
    summary: string;
    lockedPaths: PathSegment[][];
  }) {
    const line = this.state.focusedLine;
    return {
      ...input,
      line,
      lineCount: this.document.lineCount,
      canPrev:
        line !== null &&
        adjacentNonEmptyLine(line, -1, this.document.lineCount, current =>
          this.lineText(current)
        ) !== null,
      canNext:
        line !== null &&
        adjacentNonEmptyLine(line, 1, this.document.lineCount, current =>
          this.lineText(current)
        ) !== null,
    };
  }

  private navigate(direction: 1 | -1) {
    if (this.state.focusedLine === null) return;
    const next = adjacentNonEmptyLine(
      this.state.focusedLine,
      direction,
      this.document.lineCount,
      current => this.lineText(current)
    );
    if (next === null) return;
    this.focusLine(next);
    this.revealLine(next);
  }

  private neighborLines(line: number, direction: 1 | -1): string[] {
    const out: string[] = [];
    // Bound the walk so a tens-of-MB file is not scanned to pair one record.
    for (let step = 1; step <= 120 && out.length < 80; step += 1) {
      const index = line + direction * step;
      if (index < 0 || index >= this.document.lineCount) break;
      const text = this.lineText(index);
      if (!text.trim() || text.length > 64_000) continue;
      out.push(text);
    }
    return out;
  }

  private isAgentModeOn(): boolean {
    if (this.manual === true) return true;
    if (this.manual === false) return false;
    return this.detectEnabled() && this.detected !== null;
  }

  private agentFamily(): AgentFamily | "generic" | null {
    if (!this.isAgentModeOn()) return null;
    return this.detected ?? "generic";
  }

  private detectEnabled(): boolean {
    return (
      vscode.workspace
        .getConfiguration("jsonl-vision")
        .get<boolean>("detectAgentSessions", true) !== false
    );
  }

  /** Classify the file from a bounded head. Long lines contribute only a prefix. */
  private sniff() {
    const head: string[] = [];
    const last = Math.min(this.document.lineCount, 80);
    for (let index = 0; index < last && head.length < 40; index += 1) {
      const text = this.lineText(index);
      if (!text.trim()) continue;
      head.push(text.length > 64_000 ? text.slice(0, 8_000) : text);
    }
    this.detected = detectAgentSession(head);
  }

  private dispose() {
    while (this.disposables.length) this.disposables.pop()?.dispose();
    this.onDisposed();
  }
}
