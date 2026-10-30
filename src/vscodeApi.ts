// `acquireVsCodeApi()` may only be called once per webview load — a second call
// throws. Cache the handle so both the "ready" handshake and the tab-strip
// actions can post messages back to the extension host through one instance.

interface VsCodeApi {
  postMessage: (message: unknown) => void;
}

let cached: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi | undefined {
  if (!cached) cached = window.acquireVsCodeApi?.();
  return cached;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}
