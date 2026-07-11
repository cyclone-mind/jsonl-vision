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
  },
};
