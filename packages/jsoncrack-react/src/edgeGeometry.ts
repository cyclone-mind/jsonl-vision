import { EDGE_INSET, ROW_HEIGHT } from "./layoutConstants";
import type { EdgeData, NodeRect } from "./types";

/** Absolute Y coordinate of an edge's source-row center. */
export const getSourceRowY = (edge: EdgeData, source: NodeRect): number | null => {
  if (edge.fromRowIndex == null) return null;
  return (
    source.y +
    source.rowOffsetY +
    (edge.fromRowOffsetY ?? edge.fromRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2)
  );
};

/** Match the rendered connector landing: straight if aligned, center otherwise. */
export const getTargetLandingY = (sourceY: number, target: NodeRect): number => {
  const bodyTop = target.y + EDGE_INSET;
  const bodyBottom = target.y + target.height - EDGE_INSET;
  return sourceY >= bodyTop && sourceY <= bodyBottom ? sourceY : target.y + target.height / 2;
};
