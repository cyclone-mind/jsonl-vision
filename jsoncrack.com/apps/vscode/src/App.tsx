import { useCallback, useEffect, useState } from "react";
import { Box, MantineProvider } from "@mantine/core";
import { CodeHighlightAdapterProvider, createShikiAdapter } from "@mantine/code-highlight";
import type { NodeData } from "jsoncrack-react";
import { JSONCrack } from "jsoncrack-react";
import { NodeModal } from "./components/NodeModal";
import type { TabStripTab } from "./components/TabStrip";
import { TabStrip } from "./components/TabStrip";
import { getVsCodeApi } from "./vscodeApi";

async function loadShiki() {
  const { createHighlighter } = await import("shiki");
  return createHighlighter({ langs: ["json"], themes: [] });
}

const shikiAdapter = createShikiAdapter(loadShiki);

function getTheme() {
  const theme = document.body.getAttribute("data-vscode-theme-kind");
  if (theme?.includes("light")) return "light" as const;
  return "dark";
}

interface HostMessage {
  json?: string;
  // Present only in JSONL line-tracking mode; absent for whole-document `.json`.
  tabs?: TabStripTab[];
  focusedLine?: number | null;
}

const App: React.FC = () => {
  const [json, setJson] = useState("{}");
  const [tabs, setTabs] = useState<TabStripTab[]>([]);
  const [focusedLine, setFocusedLine] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const theme = getTheme();

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
    <MantineProvider forceColorScheme={theme}>
      <CodeHighlightAdapterProvider adapter={shikiAdapter}>
        <Box h="100vh" w="100vw" style={{ display: "flex", flexDirection: "column" }}>
          {tabs.length > 0 && (
            <TabStrip
              tabs={tabs}
              focusedLine={focusedLine}
              onFocus={focusTab}
              onClose={closeTab}
              onRefresh={refreshTab}
            />
          )}
          <Box style={{ position: "relative", flex: 1, minHeight: 0 }}>
            <JSONCrack
              json={json}
              theme={theme}
              showControls={false}
              onNodeClick={handleNodeClick}
              onEditValue={editingEnabled ? editValue : undefined}
            />
          </Box>
          {selectedNode && (
            <NodeModal opened={!!selectedNode} onClose={closeNodeModal} nodeData={selectedNode} />
          )}
        </Box>
      </CodeHighlightAdapterProvider>
    </MantineProvider>
  );
};

export default App;
