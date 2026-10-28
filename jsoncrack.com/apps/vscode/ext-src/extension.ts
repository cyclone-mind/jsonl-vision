import * as path from "path";
import * as vscode from "vscode";
import { graphPayload } from "./jsonGuard";
import { isJsonlDocument, startLineTracking } from "./lineTracking";
import { createWebviewPanel } from "./webview";

function getPanelTitle(document?: vscode.TextDocument) {
  if (!document) return "JSONL Vision";

  const fileName = path.basename(document.fileName);
  return fileName || "JSONL Vision";
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("jsonl-vision.start", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && isJsonlDocument(editor.document)) {
        // JSONL files use the per-line flow; plain .json keeps whole-document mode.
        startLineTracking(context, editor);
      } else {
        createWebviewForActiveEditor(context);
      }
    }),
    vscode.commands.registerCommand("jsonl-vision.start.specific", (content?: string) =>
      createWebviewForContent(context, content)
    ),
    vscode.commands.registerCommand("jsonl-vision.start.selected", () =>
      createWebviewForSelectedText(context)
    )
  );
}

// create webview for selected text
async function createWebviewForSelectedText(context: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;

  if (editor && editor.selection.isEmpty) {
    vscode.window.showInformationMessage("Please select some text first!");
    return;
  }

  // Create the webview panel and send the selected JSON content
  const panel = createWebviewPanel(context, getPanelTitle(editor?.document));
  const postSelection = () => {
    panel.webview.postMessage(
      graphPayload(editor?.document.getText(editor.selection) ?? "", "selection")
    );
  };
  postSelection();

  const onReceiveMessage = panel.webview.onDidReceiveMessage(e => {
    if (e === "ready") postSelection();
  });

  const onTextChange = vscode.workspace.onDidChangeTextDocument(changeEvent => {
    if (changeEvent.document === editor?.document) postSelection();
  });

  const disposer = () => {
    onTextChange.dispose();
    onReceiveMessage.dispose();
  };

  panel.onDidDispose(disposer, null, context.subscriptions);
}

async function createWebviewForActiveEditor(context: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;
  const panel = createWebviewPanel(context, getPanelTitle(editor?.document));

  const postDocument = () => {
    panel.webview.postMessage(graphPayload(editor?.document.getText() ?? "", "document"));
  };

  const onReceiveMessage = panel.webview.onDidReceiveMessage(e => {
    if (e === "ready") postDocument();
  });

  const onTextChange = vscode.workspace.onDidChangeTextDocument(changeEvent => {
    if (changeEvent.document === editor?.document) postDocument();
  });

  const disposer = () => {
    onTextChange.dispose();
    onReceiveMessage.dispose();
  };

  panel.onDidDispose(disposer, null, context.subscriptions);
}

/**
 * Renders a readonly diagram from a string
 * @param context ExtensionContext
 * @param content JSON content as a string
 */
function createWebviewForContent(context?: vscode.ExtensionContext, content?: string): any {
  if (context && content) {
    const panel = createWebviewPanel(
      context,
      getPanelTitle(vscode.window.activeTextEditor?.document)
    );
    panel.webview.postMessage(graphPayload(content, "document"));
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
