import * as path from "path";
import * as vscode from "vscode";
import type { PathSegment, Scalar } from "./applyEdit";
import { applyScalarEdit } from "./applyEdit";
import { graphPayload } from "./jsonGuard";
import { focusLineDecision } from "./lineFocus";
import type { TextChange } from "./lineShift";
import { shiftLineNumber } from "./lineShift";
import type { LineTabsAction, LineTabsState } from "./lineTabs";
import { applyLineShifts, createState, reduce } from "./lineTabs";
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

  constructor(
    private readonly context: vscode.ExtensionContext,
    editor: vscode.TextEditor,
    private readonly onDisposed: () => void
  ) {
    this.document = editor.document;
    const title = `JSONL Vision — ${path.basename(this.document.fileName)}`;
    this.panel = createWebviewPanel(context, title);

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

    // Focus the line the cursor is already on when tracking starts.
    this.focusLine(editor.selection.active.line);
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

    // A scalar edit targets the focused line, not a tab id.
    if (m.type === "editValue") {
      if (this.state.focusedLine !== null && Array.isArray(m.path)) {
        void this.applyEdit(this.state.focusedLine, m.path, m.value ?? null);
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
    const result = applyScalarEdit(original, editPath, value);
    if (!result.ok || result.text === original) return;

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

    const shifted = applyLineShifts(this.state, mapped);
    const nextCursorLine =
      this.lastFocusedLine === null ? null : shiftLineNumber(this.lastFocusedLine, mapped);
    let changed = shifted !== this.state || nextCursorLine !== this.lastFocusedLine;
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
    return this.document.lineAt(line).text;
  }

  private post() {
    if (!this.webviewReady) return;
    const focusedText =
      this.state.focusedLine === null ? "" : this.lineText(this.state.focusedLine);
    this.panel.webview.postMessage({
      ...graphPayload(focusedText, "line"),
      tabs: this.state.tabs,
      focusedLine: this.state.focusedLine,
    });
  }

  private dispose() {
    while (this.disposables.length) this.disposables.pop()?.dispose();
    this.onDisposed();
  }
}
