import type { CanvasThemeMode } from "./types";

export interface JSONCrackTheme {
  NODE_COLORS: {
    TEXT: string;
    NODE_KEY: string;
    NODE_VALUE: string;
    INTEGER: string;
    NULL: string;
    BOOL: {
      FALSE: string;
      TRUE: string;
    };
    CHILD_COUNT: string;
    DIVIDER: string;
  };
  INTERACTIVE_NORMAL: string;
  BACKGROUND_NODE: string;
  BACKGROUND_MODIFIER_ACCENT: string;
  TEXT_POSITIVE: string;
  GRID_BG_COLOR: string;
  GRID_COLOR_PRIMARY: string;
  GRID_COLOR_SECONDARY: string;
  /** Stroke color for the curved connectors between nodes. */
  EDGE_STROKE: string;
  /** Card background fill. */
  NODE_FILL: string;
  /** Card border stroke (resting state). */
  NODE_STROKE: string;
  /** Warm highlight applied on node/edge hover. */
  ACCENT: string;
  /**
   * Per-depth header band colors (background + foreground). Nodes pick a slot
   * by nesting depth so an object-in-an-object reads as a distinct band.
   */
  HEADER_COLORS: Array<{ bg: string; fg: string }>;
}

/**
 * JSONL Vision warm/pastel palette (ADR 0001 items 6 & 12), replacing JSON
 * Crack's default cool dark/flat theme. Cards are warm off-white / warm-charcoal
 * with pastel per-category value coloring, soft taupe connectors, and an amber
 * hover accent — matching the todiagram.com reference the user liked.
 */
export const themes: Record<CanvasThemeMode, JSONCrackTheme> = {
  dark: {
    NODE_COLORS: {
      TEXT: "#ece3d7",
      NODE_KEY: "#e6a9cd",
      NODE_VALUE: "#b3cf96",
      INTEGER: "#f0b06a",
      NULL: "#9a8f7f",
      BOOL: {
        FALSE: "#f0937d",
        TRUE: "#7dd6a4",
      },
      CHILD_COUNT: "#d8c8b2",
      DIVIDER: "#3a322b",
    },
    INTERACTIVE_NORMAL: "#c8bcac",
    BACKGROUND_NODE: "#2c2622",
    BACKGROUND_MODIFIER_ACCENT: "rgba(240,176,106,0.16)",
    TEXT_POSITIVE: "#7dd6a4",
    GRID_BG_COLOR: "#211d1a",
    GRID_COLOR_PRIMARY: "#2b2621",
    GRID_COLOR_SECONDARY: "#262019",
    EDGE_STROKE: "#4d4238",
    NODE_FILL: "#2c2622",
    NODE_STROKE: "#463d34",
    ACCENT: "#f0b06a",
    HEADER_COLORS: [
      { bg: "#4a2f3c", fg: "#f0b6cf" },
      { bg: "#4a3a29", fg: "#f0c58a" },
      { bg: "#38442c", fg: "#bcd69a" },
      { bg: "#3b3450", fg: "#c7b6ec" },
      { bg: "#2c4340", fg: "#93cfc7" },
      { bg: "#45342a", fg: "#e6b596" },
    ],
  },
  light: {
    NODE_COLORS: {
      TEXT: "#4a3f35",
      NODE_KEY: "#b0568a",
      NODE_VALUE: "#5f7d4f",
      INTEGER: "#c26a2b",
      NULL: "#a89b8a",
      BOOL: {
        FALSE: "#d9694f",
        TRUE: "#3f8f6b",
      },
      CHILD_COUNT: "#8a7a66",
      DIVIDER: "#efe6d8",
    },
    INTERACTIVE_NORMAL: "#6b5d4d",
    BACKGROUND_NODE: "#fffdf9",
    BACKGROUND_MODIFIER_ACCENT: "rgba(176,120,72,0.18)",
    TEXT_POSITIVE: "#3f8f6b",
    GRID_BG_COLOR: "#faf6ef",
    GRID_COLOR_PRIMARY: "#ece3d5",
    GRID_COLOR_SECONDARY: "#f2ebe0",
    EDGE_STROKE: "#d8c9b4",
    NODE_FILL: "#fffdf9",
    NODE_STROKE: "#e7dccb",
    ACCENT: "#e0894e",
    HEADER_COLORS: [
      { bg: "#f6dfe8", fg: "#9d3f6a" },
      { bg: "#f7e6cf", fg: "#a6641f" },
      { bg: "#e6efd6", fg: "#55702f" },
      { bg: "#e9e2f4", fg: "#6b4c9a" },
      { bg: "#d9edea", fg: "#2f6f68" },
      { bg: "#f2e2d7", fg: "#9c5a38" },
    ],
  },
};
