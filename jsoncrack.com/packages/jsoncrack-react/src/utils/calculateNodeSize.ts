import { MAX_NODE_WIDTH, ROW_HEIGHT, WRAPPED_LINE_HEIGHT } from "../layoutConstants";

const NODE_DIMENSIONS = {
  PARENT_HEIGHT: 36,
} as const;

type Text = number | string | [string, string][];
type Size = { width: number; height: number; rowHeights?: number[] };

const HORIZONTAL_PADDING = 24;
const VERTICAL_PADDING = 12;
const FALLBACK_CHAR_WIDTH = 7.2;
const FALLBACK_WIDE_CHAR_WIDTH = 12;
const MAX_CONTENT_WIDTH = MAX_NODE_WIDTH - HORIZONTAL_PADDING;

const CACHE_TTL_MS = 120_000;
const sizeCache = new Map<string, Size>();
const rowSizeCache = new Map<string, Size>();
let lastCacheClearAt = Date.now();

const textRows = (text: Text): string[] => {
  if (Array.isArray(text)) {
    return text.map(([key, value]) => `${key}: ${value}`);
  }

  return [`${text}`];
};

const estimatedLineWidth = (line: string): number => {
  let width = 0;
  for (const char of line) {
    width += (char.codePointAt(0) ?? 0) > 0xff ? FALLBACK_WIDE_CHAR_WIDTH : FALLBACK_CHAR_WIDTH;
  }
  return width;
};

const wrappedLineCount = (str: string, contentWidth = MAX_CONTENT_WIDTH): number => {
  return str.split("\n").reduce((total, line) => {
    return total + Math.max(1, Math.ceil(estimatedLineWidth(line) / contentWidth));
  }, 0);
};

const fallbackTextWidth = (str: string): number => {
  const longestLine = str
    .split("\n")
    .reduce((max, line) => Math.max(max, estimatedLineWidth(line)), 0);
  return longestLine + HORIZONTAL_PADDING;
};

const fallbackRowSize = (str: string, single: boolean): Size => {
  const width = Math.min(MAX_NODE_WIDTH, Math.max(45, fallbackTextWidth(str)));
  const lineCount = wrappedLineCount(str);
  const wrapped = lineCount > 1;

  return {
    width,
    height: single
      ? wrapped
        ? Math.max(ROW_HEIGHT, lineCount * WRAPPED_LINE_HEIGHT + VERTICAL_PADDING)
        : NODE_DIMENSIONS.PARENT_HEIGHT
      : Math.max(ROW_HEIGHT, lineCount * WRAPPED_LINE_HEIGHT + VERTICAL_PADDING),
  };
};

const calculateRowsSize = (rows: string[], single: boolean): Size => {
  if (single && !rows[0]) return { width: 45, height: 45 };

  if (typeof document === "undefined") {
    const rowSizes = rows.map(row => fallbackRowSize(row, single));
    return {
      width: Math.max(...rowSizes.map(size => size.width)),
      height: rowSizes.reduce((total, size) => total + size.height, 0),
      ...(!single && { rowHeights: rowSizes.map(size => size.height) }),
    };
  }

  const rowSizes = new Array<Size>(rows.length);
  const rowsToMeasure: Array<{ element: HTMLDivElement; index: number; cacheKey: string }> = [];

  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.visibility = "hidden";
  container.style.pointerEvents = "none";
  container.style.fontSize = "12px";
  container.style.fontWeight = "500";
  container.style.fontFamily = "monospace";

  rows.forEach((row, index) => {
    const cacheKey = `${single}-${row}`;
    const cached = rowSizeCache.get(cacheKey);
    if (cached) {
      rowSizes[index] = cached;
      return;
    }

    // Most large JSON objects contain many short scalar rows. Avoid a DOM
    // layout read for those; only browser-measure rows that can actually wrap.
    if (!row.includes("\n") && fallbackTextWidth(row) <= MAX_NODE_WIDTH) {
      const size = fallbackRowSize(row, single);
      rowSizeCache.set(cacheKey, size);
      rowSizes[index] = size;
      return;
    }

    const element = document.createElement("div");
    element.style.whiteSpace = "pre-wrap";
    element.style.overflowWrap = "anywhere";
    element.style.maxWidth = `${MAX_CONTENT_WIDTH}px`;
    element.style.width = "max-content";
    element.style.lineHeight = `${WRAPPED_LINE_HEIGHT}px`;
    element.innerText = row;
    container.appendChild(element);
    rowsToMeasure.push({ element, index, cacheKey });
  });

  if (rowsToMeasure.length > 0) {
    document.body.appendChild(container);
    for (const { element, index, cacheKey } of rowsToMeasure) {
      const rect = element.getBoundingClientRect();
      const wrapped = rect.height > WRAPPED_LINE_HEIGHT + 0.5;
      const size = {
        width: Math.min(MAX_NODE_WIDTH, Math.max(45, rect.width + HORIZONTAL_PADDING)),
        height:
          single && !wrapped
            ? NODE_DIMENSIONS.PARENT_HEIGHT
            : Math.max(ROW_HEIGHT, rect.height + VERTICAL_PADDING),
      };
      rowSizeCache.set(cacheKey, size);
      rowSizes[index] = size;
    }
    document.body.removeChild(container);
  }

  return {
    width: Math.max(...rowSizes.map(size => size.width)),
    height: rowSizes.reduce((total, size) => total + size.height, 0),
    ...(!single && { rowHeights: rowSizes.map(size => size.height) }),
  };
};

const maybeClearCache = () => {
  if (Date.now() - lastCacheClearAt < CACHE_TTL_MS) return;
  sizeCache.clear();
  rowSizeCache.clear();
  lastCacheClearAt = Date.now();
};

export const calculateNodeSize = (text: Text, isParent = false) => {
  maybeClearCache();

  const cacheKey = `${JSON.stringify(text)}-${isParent}`;

  const cached = sizeCache.get(cacheKey);
  if (cached) return cached;

  const sizes = calculateRowsSize(textRows(text), typeof text === "string");

  if (isParent) sizes.width += 80;
  if (sizes.width > MAX_NODE_WIDTH) sizes.width = MAX_NODE_WIDTH;

  sizeCache.set(cacheKey, sizes);
  return sizes;
};
