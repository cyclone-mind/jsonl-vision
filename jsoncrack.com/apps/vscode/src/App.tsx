import { useCallback, useEffect, useState } from "react";
import type { NodeData } from "jsoncrack-react";
import { JSONCrack } from "jsoncrack-react";
import { NodeModal } from "./components/NodeModal";
import type { TabStripTab } from "./components/TabStrip";
import { TabStrip } from "./components/TabStrip";
import { getVsCodeApi } from "./vscodeApi";

type BackgroundSetting = "auto" | "dark" | "warm";

/** Read the initial `jsonl-vision.background` value the host stamped on <body>. */
function readInitialBackground(): BackgroundSetting {
  const bg = document.body.getAttribute("data-jsonl-background");
  return bg === "dark" || bg === "warm" ? bg : "auto";
}

/** Resolve the graph palette from the background setting. "dark"/"warm" pin a
 *  palette (warm = the "light" cream one); "auto" (or the standalone dev server,
 *  which has no override) follows the VS Code theme. */
function resolveTheme(background: BackgroundSetting) {
  if (background === "dark") return "dark" as const;
  if (background === "warm") return "light" as const;
  const kind = document.body.getAttribute("data-vscode-theme-kind");
  return kind?.includes("light") ? ("light" as const) : ("dark" as const);
}

interface HostMessage {
  json?: string;
  // Present only in JSONL line-tracking mode; absent for whole-document `.json`.
  tabs?: TabStripTab[];
  focusedLine?: number | null;
  // Pushed live when the jsonl-vision.background setting changes.
  background?: BackgroundSetting;
}

const App: React.FC = () => {
  const [json, setJson] = useState("{}");
  const [tabs, setTabs] = useState<TabStripTab[]>([]);
  const [focusedLine, setFocusedLine] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [background, setBackground] = useState<BackgroundSetting>(readInitialBackground);
  const theme = resolveTheme(background);

  useEffect(() => {
    const vscode = getVsCodeApi();
    vscode?.postMessage("ready");

    const onMessage = (event: MessageEvent<HostMessage>) => {
      const data = event.data;
      if (typeof data?.json === "string") {
        setJson(data.json);
      }
      // JSONL mode sends the tab set; whole-document mode never does, so these
      // stay empty and the strip is not rendered.
      if (Array.isArray(data?.tabs)) {
        setTabs(data.tabs);
        setFocusedLine(data.focusedLine ?? null);
      }
      // Live background-setting change pushed by the host.
      if (data?.background === "auto" || data?.background === "dark" || data?.background === "warm") {
        setBackground(data.background);
      }
    };

    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  const handleNodeClick = useCallback((node: NodeData) => {
    setSelectedNode(node);
  }, []);

  const closeNodeModal = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const focusTab = useCallback((line: number) => {
    getVsCodeApi()?.postMessage({ type: "clickTab", line });
  }, []);

  const closeTab = useCallback((line: number) => {
    getVsCodeApi()?.postMessage({ type: "closeTab", line });
  }, []);

  const refreshTab = useCallback((line: number) => {
    getVsCodeApi()?.postMessage({ type: "refreshTab", line });
  }, []);

  const closeTabsLeft = useCallback((line: number) => {
    getVsCodeApi()?.postMessage({ type: "closeTabsLeft", line });
  }, []);

  const closeTabsRight = useCallback((line: number) => {
    getVsCodeApi()?.postMessage({ type: "closeTabsRight", line });
  }, []);

  const closeOtherTabs = useCallback((line: number) => {
    getVsCodeApi()?.postMessage({ type: "closeOtherTabs", line });
  }, []);

  const editValue = useCallback(
    (path: (string | number)[], value: string | number | boolean | null) => {
      getVsCodeApi()?.postMessage({ type: "editValue", path, value });
    },
    []
  );

  // Inline editing is only wired up in JSONL line-tracking mode (the host only
  // handles editValue there); plain .json stays read-only.
  const editingEnabled = tabs.length > 0;

  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column" }}>
      {tabs.length > 0 && (
        <TabStrip
          tabs={tabs}
          focusedLine={focusedLine}
          onFocus={focusTab}
          onClose={closeTab}
          onRefresh={refreshTab}
          onCloseLeft={closeTabsLeft}
          onCloseRight={closeTabsRight}
          onCloseOthers={closeOtherTabs}
        />
      )}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <JSONCrack
          json={json}
          theme={theme}
          showControls={false}
          onNodeClick={handleNodeClick}
          onEditValue={editingEnabled ? editValue : undefined}
        />
      </div>
      {selectedNode && (
        <NodeModal opened={!!selectedNode} onClose={closeNodeModal} nodeData={selectedNode} />
      )}
    </div>
  );
};

export default App;
