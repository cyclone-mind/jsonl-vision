/** Height of a single key/value row inside a node (px). */
export const ROW_HEIGHT = 30;
/** Line height used by wrapped scalar values inside a node row (px). */
export const WRAPPED_LINE_HEIGHT = 18;
/** Maximum laid-out node width before scalar strings wrap (px). */
export const MAX_NODE_WIDTH = 700;
/** Keep connector endpoints this far inside node top/bottom edges (px). */
export const EDGE_INSET = 6;

/**
 * Height of a node's colored header band (px). Present on every non-root
 * object node (see item 15 in ADR 0001) and reserved in the node's measured
 * height so rows flow below it.
 */
export const HEADER_HEIGHT = 34;

/** Number of header background/foreground color slots (see theme HEADER_COLORS). */
export const HEADER_COLOR_COUNT = 6;
