import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONCrackRef, NodeData } from "jsoncrack-react";
import { JSONCrack } from "jsoncrack-react";
import { blobToBase64, captureGraph } from "./captureGraph";
import { GraphSearch } from "./components/GraphSearch";
import type { LayoutDirection } from "./components/GraphToolbar";
import { GraphToolbar } from "./components/GraphToolbar";
import { NodeModal } from "./components/NodeModal";
import type { RecordNavState } from "./components/RecordNav";
import { RecordNav } from "./components/RecordNav";
import type { SessionBarState } from "./components/SessionBar";
import { SessionBar } from "./components/SessionBar";
import type { TabStripTab } from "./components/TabStrip";
import { TabStrip } from "./components/TabStrip";
import { findGraphMatches, matchCountLabel, stepMatchIndex } from "./graphSearch";
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
function readInitialLayout(): LayoutDirection {
  return document.body.getAttribute("data-jsonl-layout") === "DOWN" ? "DOWN" : "RIGHT";
}

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
  /** Set when the host refused to graph `json` (invalid, too deep, or too large). */
  problem?: string | null;
  /** Agent session chrome. Null in raw JSONL / whole-document mode. */
  session?: SessionBarState | null;
  /** Present in JSONL line mode, including when agent session mode is off. */
  record?: RecordNavState | null;
  layoutDirection?: LayoutDirection;
  type?: string;
  action?: string;
}

const App: React.FC = () => {
  const [json, setJson] = useState("{}");
  const [tabs, setTabs] = useState<TabStripTab[]>([]);
  const [focusedLine, setFocusedLine] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [background, setBackground] = useState<BackgroundSetting>(readInitialBackground);
  const [problem, setProblem] = useState<string | null>(null);
  const [session, setSession] = useState<SessionBarState | null>(null);
  const [record, setRecord] = useState<RecordNavState | null>(null);
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [layout, setLayout] = useState<LayoutDirection>(readInitialLayout);
  const [collapsed, setCollapsed] = useState(false);
  const [toolbarStatus, setToolbarStatus] = useState<string | null>(null);
  const graphRef = useRef<JSONCrackRef>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const commandsRef = useRef<(action: string) => void>(() => undefined);
  const theme = resolveTheme(background);
  const matches = useMemo(() => findGraphMatches(nodes, searchQuery), [nodes, searchQuery]);
  const activeMatch = activeIndex >= 0 ? matches[activeIndex] : undefined;

  useEffect(() => {
    const vscode = getVsCodeApi();
    vscode?.postMessage("ready");

    const onMessage = (event: MessageEvent<HostMessage>) => {
      const data = event.data;
      if (typeof data?.json === "string") {
        setJson(data.json);
      }
      if (data && typeof data === "object" && "problem" in data) {
        const nextProblem = typeof data.problem === "string" && data.problem ? data.problem : null;
        setProblem(nextProblem);
        if (nextProblem) setSelectedNode(null);
      }
      // JSONL mode sends the tab set; whole-document mode never does, so these
      // stay empty and the strip is not rendered.
      if (Array.isArray(data?.tabs)) {
        setTabs(data.tabs);
        setFocusedLine(data.focusedLine ?? null);
      }
      // Live background-setting change pushed by the host.
      if (
        data?.background === "auto" ||
        data?.background === "dark" ||
        data?.background === "warm"
      ) {
        setBackground(data.background);
      }
      if (data && typeof data === "object" && "session" in data) {
        setSession(data.session ?? null);
      }
      if (data && typeof data === "object" && "record" in data) {
        setRecord(data.record ?? null);
      }
      if (data?.layoutDirection === "RIGHT" || data?.layoutDirection === "DOWN") {
        setLayout(data.layoutDirection);
      }
      if (data?.type === "graphCommand" && typeof data.action === "string") {
        commandsRef.current(data.action);
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

  const isPathEditable = useCallback(
    (path: (string | number)[]) => {
      const locked = session?.lockedPaths ?? [];
      return !locked.some(
        prefix =>
          prefix.length <= path.length && prefix.every((segment, index) => segment === path[index])
      );
    },
    [session]
  );

  const navigate = useCallback((direction: "prev" | "next") => {
    getVsCodeApi()?.postMessage({ type: "navigate", direction });
  }, []);

  const findLine = useCallback(
    (direction: "prev" | "next") => {
      const query = searchQuery.trim();
      if (!query) return;
      getVsCodeApi()?.postMessage({ type: "findLine", query, direction });
    },
    [searchQuery]
  );

  const jumpMatch = useCallback(
    (backward: boolean) => {
      const next = stepMatchIndex(matches.length, activeIndex, backward);
      setActiveIndex(next);
      const match = matches[next];
      if (match) graphRef.current?.centerNode(match.nodeId);
    },
    [activeIndex, matches]
  );

  const openSearch = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [searchQuery, json]);

  useEffect(() => {
    setCollapsed(false);
  }, [layout, json]);

  const toggleSession = useCallback(() => {
    getVsCodeApi()?.postMessage({ type: "toggleAgentSession" });
  }, []);

  const canPrevRecord = session?.enabled ? session.canPrev : (record?.canPrev ?? false);
  const canNextRecord = session?.enabled ? session.canNext : (record?.canNext ?? false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const findShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f";
      if (findShortcut) {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === "Escape" && searchOpen && !selectedNode) {
        event.preventDefault();
        setSearchOpen(false);
        setSearchQuery("");
        setActiveIndex(-1);
        return;
      }
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (tabs.length === 0) return;
      if (event.key === "ArrowLeft" && canPrevRecord) {
        event.preventDefault();
        getVsCodeApi()?.postMessage({ type: "navigate", direction: "prev" });
      } else if (event.key === "ArrowRight" && canNextRecord) {
        event.preventDefault();
        getVsCodeApi()?.postMessage({ type: "navigate", direction: "next" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canNextRecord, canPrevRecord, searchOpen, selectedNode, tabs.length]);

  const noteStatus = useCallback((text: string) => {
    setToolbarStatus(text);
    window.setTimeout(() => setToolbarStatus(current => (current === text ? null : current)), 2500);
  }, []);

  const exportGraph = useCallback(
    async (kind: "png" | "png-clear" | "svg" | "copy") => {
      const root = frameRef.current;
      if (!root || problem) {
        noteStatus("Nothing to export");
        return;
      }
      try {
        const captured = await captureGraph(root, kind === "png-clear");
        if (kind === "copy") {
          const item = new ClipboardItem({ "image/png": captured.png });
          await navigator.clipboard.write([item]);
          noteStatus(captured.size.capped ? "Copied (scaled down)" : "Copied");
          return;
        }
        const base64 =
          kind === "svg"
            ? btoa(unescape(encodeURIComponent(captured.svg)))
            : await blobToBase64(captured.png);
        const api = getVsCodeApi();
        if (!api) {
          const href = URL.createObjectURL(
            kind === "svg" ? new Blob([captured.svg], { type: "image/svg+xml" }) : captured.png
          );
          const link = document.createElement("a");
          link.href = href;
          link.download = kind === "svg" ? "graph.svg" : "graph.png";
          link.click();
          URL.revokeObjectURL(href);
          noteStatus(captured.size.capped ? "Exported (scaled down)" : "Exported");
          return;
        }
        api.postMessage({
          type: "saveExport",
          format: kind === "svg" ? "svg" : "png",
          base64,
          capped: captured.size.capped,
        });
      } catch (error) {
        noteStatus(error instanceof Error ? error.message : "Export failed");
      }
    },
    [noteStatus, problem]
  );

  const toggleCollapse = useCallback(() => {
    if (collapsed) {
      graphRef.current?.expandAll();
      setCollapsed(false);
    } else {
      graphRef.current?.collapseAll();
      setCollapsed(true);
    }
  }, [collapsed]);

  const rotate = useCallback(() => {
    const next = layout === "RIGHT" ? "DOWN" : "RIGHT";
    setLayout(next);
    getVsCodeApi()?.postMessage({
      type: "setLayout",
      direction: next === "DOWN" ? "down" : "right",
    });
  }, [layout]);

  commandsRef.current = action => {
    if (action === "exportPng") void exportGraph("png");
    else if (action === "exportPngTransparent") void exportGraph("png-clear");
    else if (action === "exportSvg") void exportGraph("svg");
    else if (action === "copyPng") void exportGraph("copy");
    else if (action === "collapseAll") {
      graphRef.current?.collapseAll();
      setCollapsed(true);
    } else if (action === "expandAll") {
      graphRef.current?.expandAll();
      setCollapsed(false);
    }
  };

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
      {session && (
        <SessionBar
          session={session}
          onPrev={() => navigate("prev")}
          onNext={() => navigate("next")}
          onToggle={toggleSession}
        />
      )}
      {record && tabs.length > 0 && !session?.enabled && (
        <RecordNav
          record={record}
          onPrev={() => navigate("prev")}
          onNext={() => navigate("next")}
        />
      )}
      <GraphToolbar
        layout={layout}
        collapsed={collapsed}
        disabled={!!problem}
        status={toolbarStatus}
        onToggleCollapse={toggleCollapse}
        onRotate={rotate}
        onExportPng={transparent => void exportGraph(transparent ? "png-clear" : "png")}
        onExportSvg={() => void exportGraph("svg")}
        onCopyPng={() => void exportGraph("copy")}
      />
      <div ref={frameRef} style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <GraphSearch
          open={searchOpen}
          query={searchQuery}
          countLabel={searchQuery.trim() ? matchCountLabel(matches.length, activeIndex) : ""}
          lineSearch={tabs.length > 0}
          onOpen={openSearch}
          onClose={closeSearch}
          onQuery={setSearchQuery}
          onPrevMatch={() => jumpMatch(true)}
          onNextMatch={() => jumpMatch(false)}
          onPrevLine={() => findLine("prev")}
          onNextLine={() => findLine("next")}
        />
        {problem ? (
          <div className="jsonl-problem" role="status">
            <p>{problem}</p>
          </div>
        ) : (
          <JSONCrack
            ref={graphRef}
            json={json}
            theme={theme}
            layoutDirection={layout}
            showControls={false}
            onNodeClick={handleNodeClick}
            onParse={graph => setNodes(graph.nodes)}
            onEditValue={editingEnabled ? editValue : undefined}
            isPathEditable={session?.enabled ? isPathEditable : undefined}
            graphSearch={
              searchOpen && searchQuery.trim()
                ? {
                    query: searchQuery.trim(),
                    active: activeMatch
                      ? {
                          nodeId: activeMatch.nodeId,
                          rowIndex: activeMatch.rowIndex,
                          field: activeMatch.field,
                        }
                      : null,
                  }
                : undefined
            }
          />
        )}
      </div>
      {selectedNode && (
        <NodeModal opened={!!selectedNode} onClose={closeNodeModal} nodeData={selectedNode} />
      )}
    </div>
  );
};

export default App;
