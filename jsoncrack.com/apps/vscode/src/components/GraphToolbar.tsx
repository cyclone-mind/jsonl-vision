export type LayoutDirection = "RIGHT" | "DOWN";

interface GraphToolbarProps {
  layout: LayoutDirection;
  collapsed: boolean;
  disabled: boolean;
  status: string | null;
  onToggleCollapse: () => void;
  onRotate: () => void;
  onExportPng: (transparent: boolean) => void;
  onExportSvg: () => void;
  onCopyPng: () => void;
}

export function GraphToolbar({
  layout,
  collapsed,
  disabled,
  status,
  onToggleCollapse,
  onRotate,
  onExportPng,
  onExportSvg,
  onCopyPng,
}: GraphToolbarProps) {
  return (
    <div className="jsonl-toolbar" role="toolbar" aria-label="Graph layout and export">
      <button type="button" disabled={disabled} onClick={onToggleCollapse}>
        {collapsed ? "Expand all" : "Collapse all"}
      </button>
      <button
        type="button"
        onClick={onRotate}
        title={layout === "RIGHT" ? "Switch to top-down layout" : "Switch to left-right layout"}
      >
        {layout === "RIGHT" ? "Top-down" : "Left-right"}
      </button>
      <button type="button" disabled={disabled} onClick={() => onExportPng(false)}>
        PNG
      </button>
      <button
        type="button"
        disabled={disabled}
        title="Export a PNG with a transparent background"
        onClick={() => onExportPng(true)}
      >
        Clear PNG
      </button>
      <button type="button" disabled={disabled} onClick={onExportSvg}>
        SVG
      </button>
      <button type="button" disabled={disabled} title="Copy the graph as a PNG" onClick={onCopyPng}>
        Copy
      </button>
      {status && <span className="jsonl-toolbar-status">{status}</span>}
    </div>
  );
}
