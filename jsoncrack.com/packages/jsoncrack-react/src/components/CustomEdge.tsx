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
/** Minimum horizontal stub off each card before the vertical riser. */
const MIN_STUB = 14;

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

  // Draw an orthogonal H→V→H "elbow" connector from the source key's row to the
  // target node, instead of ELK's curved route from an evenly-distributed exit.
  // The start anchors to the source key's row center; the end to the target's
  // left-middle. Falls back to ELK's sections until both rects are known.
  const sections = React.useMemo(() => {
    const original = props.sections;
    const fromRowIndex = edgeData?.fromRowIndex;
    const srcRect = nodePositions.get(props.source);
    const tgtRect = nodePositions.get(props.target);
    if (!srcRect || !tgtRect || fromRowIndex == null) return original;

    // Rows start below the source node's header band; measure from there.
    const startX = srcRect.x + srcRect.width;
    const rawY = srcRect.y + srcRect.rowOffsetY + fromRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
    const startY = Math.max(
      srcRect.y + srcRect.rowOffsetY + EDGE_INSET,
      Math.min(srcRect.y + srcRect.height - EDGE_INSET, rawY)
    );

    // Land on the target's header band when it has one, else its vertical center.
    const endX = tgtRect.x;
    const endY =
      tgtRect.rowOffsetY > 0 ? tgtRect.y + tgtRect.rowOffsetY / 2 : tgtRect.y + tgtRect.height / 2;

    // A vertical riser placed midway between the two cards gives the classic
    // stepped look; keep at least a short horizontal stub off each node.
    const midX = startX + Math.max(MIN_STUB, (endX - startX) / 2);

    // reaflow types `bendPoints` as a single point but spreads it as an array
    // at runtime (`...sections[0].bendPoints`), so pass an array and cast.
    return [
      {
        id: original?.[0]?.id,
        startPoint: { x: startX, y: startY },
        bendPoints: [
          { x: midX, y: startY },
          { x: midX, y: endY },
        ],
        endPoint: { x: endX, y: endY },
      },
    ] as unknown as typeof original;
  }, [props.sections, props.source, props.target, edgeData?.fromRowIndex, nodePositions]);

  return (
    <Edge
      {...props}
      sections={sections}
      interpolation="linear"
      containerClassName={`edge-${props.id}`}
      onClick={handleClick}
      onEnter={() => setHovered(true)}
      onLeave={() => setHovered(false)}
      // The key now lives in the target node's header band, so the connector
      // itself carries no label (ADR 0001 item 15 / user redesign item 3).
      label={null as never}
      labels={[]}
      style={{
        stroke: hovered ? "var(--accent)" : "var(--edge-stroke)",
        strokeWidth: 1.5,
      }}
    />
  );
};

export const CustomEdge = React.memo(CustomEdgeBase);
