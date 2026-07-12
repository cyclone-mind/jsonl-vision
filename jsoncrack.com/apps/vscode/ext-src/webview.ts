import * as path from "path";
import * as vscode from "vscode";

/** Read + validate the `jsonl-vision.background` setting to a known value. */
function resolveBackground(): "auto" | "dark" | "warm" {
  const raw = vscode.workspace.getConfiguration("jsonl-vision").get<string>("background", "auto");
  return raw === "dark" || raw === "warm" ? raw : "auto";
}

export function createWebviewPanel(context: vscode.ExtensionContext, title = "JSONL Vision") {
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
      <body data-jsonl-background="${background}">
        <noscript>You need to enable JavaScript to run this app.</noscript>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;

  // Hot-reload the background setting: re-post it to this panel whenever it
  // changes, so the theme updates live without reopening. Scoped to this panel
  // and torn down with it.
  const cfgSub = vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration("jsonl-vision.background")) {
      void panel.webview.postMessage({ background: resolveBackground() });
    }
  });
  panel.onDidDispose(() => cfgSub.dispose());

  return panel;
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
