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
/**
 * Base distance from a source card's right edge to the vertical riser. Connectors
 * leaving the *same row* (e.g. an array's items) share one riser and fork
 * together; connectors from *different* rows are staggered by {@link ROW_STAGGER}
 * so their risers don't overlap and read as one merged line.
 */
const FORK_GAP = 32;
/** Per-source-row horizontal offset of the riser, so sibling rows don't merge. */
const ROW_STAGGER = 16;
/** Corner radius for the rounded elbows. */
const CORNER_RADIUS = 9;

type Pt = { x: number; y: number };

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const along = (from: Pt, to: Pt, r: number): Pt => {
  const d = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) * r) / d, y: from.y + ((to.y - from.y) * r) / d };
};

/**
 * reaflow `interpolation` function: turn the elbow's corner points into an SVG
 * path with rounded corners (a short quadratic arc at each bend) instead of hard
 * 90° joins. Passed to `<Edge interpolation={...}>`; reaflow calls it with the
 * `[start, ...bends, end]` point list and uses the returned string as the path.
 */
const roundedElbow = (points: Pt[]): string => {
  if (!points || points.length < 2) return "";
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const r = Math.min(CORNER_RADIUS, dist(prev, corner) / 2, dist(corner, next) / 2);
    const entry = along(corner, prev, r);
    const exit = along(corner, next, r);
    d += `L${entry.x},${entry.y}Q${corner.x},${corner.y} ${exit.x},${exit.y}`;
  }
  const last = points[points.length - 1];
  d += `L${last.x},${last.y}`;
  return d;
};

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

    // If the source row already lines up with the target's body, land straight
    // across (no pointless little jog). Otherwise aim at the target's vertical
    // center, so a connector arriving from above/below points at the middle.
    const endX = tgtRect.x;
    const bodyTop = tgtRect.y + EDGE_INSET;
    const bodyBottom = tgtRect.y + tgtRect.height - EDGE_INSET;
    const endY = startY >= bodyTop && startY <= bodyBottom ? startY : tgtRect.y + tgtRect.height / 2;

    // Vertical riser: same-row connectors (array items) share one lane and fork
    // together; different rows are staggered so their risers don't overlap into
    // a single merged line. Clamped to stay in the gap between the two cards.
    const laneOffset = FORK_GAP + fromRowIndex * ROW_STAGGER;
    const trunkX = Math.max(startX + MIN_STUB, Math.min(startX + laneOffset, endX - MIN_STUB));

    // reaflow types `bendPoints` as a single point but spreads it as an array
    // at runtime (`...sections[0].bendPoints`), so pass an array and cast.
    return [
      {
        id: original?.[0]?.id,
        startPoint: { x: startX, y: startY },
        bendPoints: [
          { x: trunkX, y: startY },
          { x: trunkX, y: endY },
        ],
        endPoint: { x: endX, y: endY },
      },
    ] as unknown as typeof original;
  }, [props.sections, props.source, props.target, edgeData?.fromRowIndex, nodePositions]);

  return (
    <Edge
      {...props}
      sections={sections}
      interpolation={roundedElbow as never}
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
