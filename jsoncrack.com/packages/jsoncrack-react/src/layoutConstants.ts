/** Height of a single key/value row inside a node (px). */
export const ROW_HEIGHT = 30;

/**
 * Height of a node's colored header band (px). Present on every non-root
 * object node (see item 15 in ADR 0001) and reserved in the node's measured
 * height so rows flow below it.
 */
export const HEADER_HEIGHT = 34;

/** Number of header background/foreground color slots (see theme HEADER_COLORS). */
export const HEADER_COLOR_COUNT = 6;
