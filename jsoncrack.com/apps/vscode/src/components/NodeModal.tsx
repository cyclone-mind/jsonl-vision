import React from "react";
import type { NodeData } from "jsoncrack-react";

interface NodeModalProps {
  opened: boolean;
  onClose: () => void;
  nodeData: NodeData | null;
}

const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj: Record<string, unknown> = {};
  nodeRows.forEach(row => {
    if (row.type !== "array" && row.type !== "object" && row.key) {
      obj[row.key] = row.value;
    }
  });

  return JSON.stringify(obj, null, 2);
};

const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

/** A monospace block with a copy button. No syntax highlighter — the graph is
 *  already colored, and dropping shiki/mantine keeps the webview bundle small.
 *  Themed off VS Code's `--vscode-*` variables, matching the tab strip. */
const CopyableCode = ({ label, value }: { label: string; value: string }) => {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div className="jsonl-modal-section">
      <div className="jsonl-modal-sectionhead">
        <span className="jsonl-modal-label">{label}</span>
        <button type="button" className="jsonl-modal-copy" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="jsonl-modal-code">{value}</pre>
    </div>
  );
};

export const NodeModal = ({ opened, onClose, nodeData }: NodeModalProps) => {
  React.useEffect(() => {
    if (!opened) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opened, onClose]);

  if (!opened) return null;

  const nodeContent = normalizeNodeData(nodeData?.text ?? []);
  const jsonPath = jsonPathToString(nodeData?.path);

  return (
    <div className="jsonl-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="jsonl-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Node Content"
        onClick={event => event.stopPropagation()}
      >
        <div className="jsonl-modal-header">
          <span className="jsonl-modal-title">Node Content</span>
          <button type="button" className="jsonl-modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <CopyableCode label="Content" value={nodeContent} />
        <CopyableCode label="JSON Path" value={jsonPath} />
      </div>
    </div>
  );
};
