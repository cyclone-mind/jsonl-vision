import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { exportFileName } from "./exportName";

/** Read + validate the `jsonl-vision.background` setting to a known value. */
function resolveBackground(): "auto" | "dark" | "warm" {
  const raw = vscode.workspace.getConfiguration("jsonl-vision").get<string>("background", "auto");
  return raw === "dark" || raw === "warm" ? raw : "auto";
}

/** `right` is left-to-right. `down` is top-to-bottom. */
export function resolveLayout(): "RIGHT" | "DOWN" {
  const raw = vscode.workspace
    .getConfiguration("jsonl-vision")
    .get<string>("layoutDirection", "right");
  return raw === "down" ? "DOWN" : "RIGHT";
}

export interface ExportContext {
  fileName: string;
  directory: string;
  /** 0-based JSONL line, or null for a whole document. */
  line: number | null;
}

const openPanels: vscode.WebviewPanel[] = [];

/** Send a command to the JSONL Vision panel the user is looking at. */
export function postToJsonlVision(message: unknown): boolean {
  const panel = openPanels.find(item => item.active) ?? openPanels[openPanels.length - 1];
  if (!panel) return false;
  void panel.webview.postMessage(message);
  return true;
}

function layoutTarget(): vscode.ConfigurationTarget {
  return vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}

export function setLayoutSetting(direction: "right" | "down") {
  return vscode.workspace
    .getConfiguration("jsonl-vision")
    .update("layoutDirection", direction, layoutTarget());
}

export function rotateLayoutSetting() {
  const current = vscode.workspace
    .getConfiguration("jsonl-vision")
    .get<string>("layoutDirection", "right");
  return setLayoutSetting(current === "down" ? "right" : "down");
}

export function createWebviewPanel(
  context: vscode.ExtensionContext,
  title = "JSONL Vision",
  getExportContext?: () => ExportContext
) {
  const extPath = context.extensionPath;
  const webviewDir = vscode.Uri.file(path.join(extPath, "build", "webview"));

  const panel = vscode.window.createWebviewPanel(
    "liveHTMLPreviewer",
    title,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [webviewDir, vscode.Uri.file(path.join(extPath, "assets"))],
    }
  );

  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(extPath, "build", "webview", "index.js"))
  );
  const styleUri = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(extPath, "build", "webview", "index.css"))
  );

  // Canvas background override (jsonl-vision.background), stamped on <body> for
  // the webview to read on load.
  const background = resolveBackground();
  const layout = resolveLayout();

  const nonce = getNonce();
  const csp = [
    `default-src 'self' ${panel.webview.cspSource} blob:`,
    `connect-src ${panel.webview.cspSource} blob:`,
    `script-src 'unsafe-eval' 'unsafe-inline' ${panel.webview.cspSource}`,
    `style-src ${panel.webview.cspSource} 'unsafe-inline'`,
    `worker-src ${panel.webview.cspSource} blob: data:`,
  ].join("; ");

  panel.webview.html = `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="${csp}">
        <link href="${styleUri}" rel="stylesheet">
      </head>
      <body data-jsonl-background="${background}" data-jsonl-layout="${layout}">
        <noscript>You need to enable JavaScript to run this app.</noscript>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;

  // Hot-reload the background setting: re-post it to this panel whenever it
  // changes, so the theme updates live without reopening. Scoped to this panel
  // and torn down with it.
  openPanels.push(panel);
  const cfgSub = vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration("jsonl-vision.background")) {
      void panel.webview.postMessage({ background: resolveBackground() });
    }
    if (event.affectsConfiguration("jsonl-vision.layoutDirection")) {
      void panel.webview.postMessage({ layoutDirection: resolveLayout() });
    }
  });
  const messageSub = panel.webview.onDidReceiveMessage(message => {
    void handlePanelMessage(message, getExportContext);
  });
  panel.onDidDispose(() => {
    cfgSub.dispose();
    messageSub.dispose();
    const index = openPanels.indexOf(panel);
    if (index >= 0) openPanels.splice(index, 1);
  });

  return panel;
}

async function handlePanelMessage(message: unknown, getExportContext?: () => ExportContext) {
  if (!message || typeof message !== "object") return;
  const record = message as {
    type?: unknown;
    direction?: unknown;
    format?: unknown;
    base64?: unknown;
    capped?: unknown;
  };
  if (
    record.type === "setLayout" &&
    (record.direction === "right" || record.direction === "down")
  ) {
    await setLayoutSetting(record.direction);
    return;
  }
  if (record.type !== "saveExport") return;
  if ((record.format !== "png" && record.format !== "svg") || typeof record.base64 !== "string")
    return;
  const context = getExportContext?.() ?? { fileName: "graph", directory: "", line: null };
  const fileName = exportFileName(context.fileName, context.line, record.format);
  const directory =
    context.directory || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(directory, fileName)),
    filters: record.format === "svg" ? { SVG: ["svg"] } : { PNG: ["png"] },
    saveLabel: "Export",
  });
  if (!uri) return;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(record.base64, "base64"));
  if (record.capped === true) {
    void vscode.window.showWarningMessage(
      "JSONL Vision scaled this graph down so the export stayed within the size limit."
    );
  }
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
