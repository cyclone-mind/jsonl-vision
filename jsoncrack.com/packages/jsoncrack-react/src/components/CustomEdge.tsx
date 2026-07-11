import React from "react";
import type { ViewPort } from "react-zoomable-ui";
import type { EdgeProps } from "reaflow";
import { Edge } from "reaflow";
import type { EdgeData, NodeRect } from "../types";

type QueryRoot = {
  querySelector: (selector: string) => Element | null;
};

type CustomEdgeProps = EdgeProps & {
  viewPort: ViewPort | null;
  edgeTargetById: Map<string, string>;
  hostElement: QueryRoot | null;
  /** Laid-out source-node rects, used to anchor the edge to its key's row. */
  nodePositions: Map<string, NodeRect>;
};

/** Row height in the object node (mirrors ObjectNode's ROW_HEIGHT). */
const ROW_HEIGHT = 30;
/** Keep the anchor this far inside the card's top/bottom edges. */
const EDGE_INSET = 6;

const isQueryRoot = (value: unknown): value is QueryRoot => {
  return (
    typeof value === "object" &&
    value !== null &&
    "querySelector" in value &&
    typeof (value as QueryRoot).querySelector === "function"
  );
};

const CustomEdgeBase = ({
  viewPort,
  edgeTargetById,
  hostElement,
  nodePositions,
  ...props
}: CustomEdgeProps) => {
  const [hovered, setHovered] = React.useState(false);
  const edgeData = props.properties as EdgeData | undefined;
  const edgeId = edgeData?.id;

  const handleClick = React.useCallback(() => {
    const targetNodeId = edgeId ? edgeTargetById.get(edgeId) : undefined;
    if (!targetNodeId) return;

    const queryRoot = isQueryRoot(hostElement)
      ? hostElement
      : typeof document !== "undefined"
        ? document
        : null;
    if (!queryRoot) return;

    const targetNodeDom = queryRoot.querySelector(
      `[data-id$="node-${targetNodeId}"]`
    ) as HTMLElement | null;

    if (targetNodeDom?.parentElement) {
      viewPort?.camera.centerFitElementIntoView(targetNodeDom.parentElement, {
        elementExtraMarginForZoom: 150,
      });
    }
  }, [hostElement, edgeId, edgeTargetById, viewPort]);

  // Re-anchor the connector's start point to the vertical center of the source
  // key's row. ELK otherwise distributes edge exits evenly along the node's
  // right side, so a line for `profile:` wouldn't leave from the profile row.
  const sections = React.useMemo(() => {
    const original = props.sections;
    const fromRowIndex = edgeData?.fromRowIndex;
    if (!original?.length || fromRowIndex == null) return original;

    const rect = nodePositions.get(props.source);
    const first = original[0];
    if (!rect || !first?.startPoint) return original;

    const startX = rect.x + rect.width;
    const rawY = rect.y + fromRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
    const minY = rect.y + EDGE_INSET;
    const maxY = rect.y + rect.height - EDGE_INSET;
    const startY = Math.max(minY, Math.min(maxY, rawY));

    return [{ ...first, startPoint: { x: startX, y: startY } }, ...original.slice(1)];
  }, [props.sections, props.source, edgeData?.fromRowIndex, nodePositions]);

  return (
    <Edge
      {...props}
      sections={sections}
      containerClassName={`edge-${props.id}`}
      onClick={handleClick}
      onEnter={() => setHovered(true)}
      onLeave={() => setHovered(false)}
      style={{
        stroke: hovered ? "var(--accent)" : "var(--edge-stroke)",
        strokeWidth: 1.5,
      }}
    />
  );
};

export const CustomEdge = React.memo(CustomEdgeBase);
