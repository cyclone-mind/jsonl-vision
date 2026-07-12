import * as path from "path";
import * as vscode from "vscode";

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

  // Canvas background override (jsonl-vision.background). Validated to a known
  // value before it reaches the HTML attribute the webview reads.
  const rawBackground = vscode.workspace
    .getConfiguration("jsonl-vision")
    .get<string>("background", "auto");
  const background = rawBackground === "dark" || rawBackground === "warm" ? rawBackground : "auto";

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
