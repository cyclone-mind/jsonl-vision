import { fitExportSize, type ExportSize } from "./exportSize";

export interface CapturedGraph {
  png: Blob;
  svg: string;
  size: ExportSize;
  /** Theme background used when the PNG is not transparent. */
  background: string;
}

function layoutSize(svg: SVGSVGElement): { width: number; height: number } | null {
  const width = Number(svg.getAttribute("width"));
  const height = Number(svg.getAttribute("height"));
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }
  const box = svg.getBBox();
  if (box.width > 0 && box.height > 0) return { width: box.width, height: box.height };
  return null;
}

function findGraphSvg(root: ParentNode): SVGSVGElement | null {
  const svg =
    root.querySelector("svg.jsoncrack-canvas") ??
    root.querySelector(".jsoncrack-canvas svg") ??
    root.querySelector("svg");
  return svg instanceof SVGSVGElement ? svg : null;
}

function themeBackground(svg: SVGSVGElement): string {
  let node: Element | null = svg;
  while (node) {
    const value = getComputedStyle(node).getPropertyValue("--bg-color").trim();
    if (value) return value;
    node = node.parentElement;
  }
  return "#211d1a";
}

function parseTranslate(style: string): { x: number; y: number } {
  const x = Number(/translateX\(([-\d.]+)px\)/.exec(style)?.[1] ?? 0);
  const y = Number(/translateY\(([-\d.]+)px\)/.exec(style)?.[1] ?? 0);
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

function transparent(color: string): boolean {
  return !color || color === "none" || color === "transparent" || color === "rgba(0, 0, 0, 0)";
}

function xmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Rebuild the laid-out graph as a standalone SVG. Node text is real SVG text,
 * not HTML inside a foreignObject, so a canvas can rasterize the whole graph.
 */
export function standaloneGraphSvg(
  root: ParentNode,
  background: string | null
): { svg: string; layoutWidth: number; layoutHeight: number } | null {
  const svg = findGraphSvg(root);
  if (!svg) return null;
  const size = layoutSize(svg);
  if (!size) return null;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">`,
  ];
  if (background) {
    parts.push(`<rect width="100%" height="100%" fill="${xmlText(background)}"/>`);
  }

  svg.querySelectorAll("path").forEach(path => {
    const d = path.getAttribute("d");
    if (!d) return;
    const stroke = getComputedStyle(path).stroke;
    if (transparent(stroke)) return;
    const width = getComputedStyle(path).strokeWidth || "1";
    parts.push(
      `<path d="${xmlText(d)}" fill="none" stroke="${xmlText(stroke)}" stroke-width="${xmlText(width)}"/>`
    );
  });

  svg.querySelectorAll("g[id*='-node-']").forEach((group, index) => {
    const { x, y } = parseTranslate(group.getAttribute("style") ?? "");
    const rect = group.querySelector("rect");
    if (!rect) return;
    const width = Number(rect.getAttribute("width")) || 0;
    const height = Number(rect.getAttribute("height")) || 0;
    const radius = rect.getAttribute("rx") ?? "10";
    const fill = getComputedStyle(rect).fill;
    const stroke = getComputedStyle(rect).stroke;
    const clip = `jsonl-export-${index}`;
    parts.push(`<g transform="translate(${x},${y})">`);
    parts.push(
      `<clipPath id="${clip}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></clipPath>`
    );
    parts.push(`<g clip-path="url(#${clip})">`);
    parts.push(
      `<rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${xmlText(fill)}" stroke="${xmlText(stroke)}" stroke-width="1"/>`
    );

    const foreign = group.querySelector("foreignObject");
    if (foreign) {
      const header = [...foreign.children].find(
        child =>
          child instanceof HTMLElement &&
          !child.hasAttribute("data-key") &&
          child.textContent?.trim()
      );
      if (header instanceof HTMLElement) {
        const bg = getComputedStyle(header).backgroundColor;
        const color = getComputedStyle(header).color;
        if (!transparent(bg)) {
          parts.push(
            `<rect width="${width}" height="${header.offsetHeight || 34}" fill="${xmlText(bg)}"/>`
          );
        }
        const label = header.textContent?.trim() ?? "";
        if (label) {
          parts.push(
            `<text x="10" y="22" fill="${xmlText(color)}" font-family="ui-monospace, monospace" font-size="12" font-weight="600">${xmlText(label)}</text>`
          );
        }
      }
      foreign.querySelectorAll("[data-key]").forEach(row => {
        if (!(row instanceof HTMLElement)) return;
        const key = [...row.children].find(
          child => child instanceof HTMLElement && child.getAttribute("role") !== "button"
        );
        const keyLabel = key?.querySelector("span");
        const keyText = keyLabel?.textContent ?? "";
        const toggle = row.querySelector("[role='button']");
        const toggleText = toggle?.textContent ?? "";
        let full = row.textContent ?? "";
        if (toggleText && full.endsWith(toggleText)) full = full.slice(0, -toggleText.length);
        const keyColor = keyLabel ? getComputedStyle(keyLabel).color : getComputedStyle(row).color;
        const valueText = keyText && full.startsWith(keyText) ? full.slice(keyText.length) : full;
        const yText = row.offsetTop + Math.max(12, Math.min(row.offsetHeight, 18) * 0.72);
        const valueSource = keyText ? row : key instanceof Element ? key : row;
        const valueColor = getComputedStyle(valueSource).color;
        parts.push(
          `<text x="8" y="${yText}" font-family="ui-monospace, monospace" font-size="12" font-weight="500">`
        );
        if (keyText) parts.push(`<tspan fill="${xmlText(keyColor)}">${xmlText(keyText)}</tspan>`);
        if (valueText)
          parts.push(`<tspan fill="${xmlText(valueColor)}">${xmlText(valueText)}</tspan>`);
        parts.push("</text>");
      });
    }
    parts.push("</g></g>");
  });

  parts.push("</svg>");
  return { svg: parts.join(""), layoutWidth: size.width, layoutHeight: size.height };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The graph image could not be drawn."));
    image.src = url;
  });
}

/**
 * Rasterize the whole graph (not the current viewport). `transparent` skips
 * the theme background. Throws if there is no graph or the canvas cannot be created.
 */
export async function captureGraph(root: ParentNode, transparent: boolean): Promise<CapturedGraph> {
  const probe = findGraphSvg(root);
  const background = probe ? themeBackground(probe) : "#211d1a";
  const standalone = standaloneGraphSvg(root, transparent ? null : background);
  if (!standalone) throw new Error("There is no graph to export.");

  const size = fitExportSize(standalone.layoutWidth, standalone.layoutHeight);
  if (!size) throw new Error("This graph is too large to export.");

  const blob = new Blob([standalone.svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This graph could not be exported.");
    if (!transparent) {
      context.fillStyle = background;
      context.fillRect(0, 0, size.width, size.height);
    }
    context.drawImage(image, 0, 0, size.width, size.height);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => {
        if (result) resolve(result);
        else reject(new Error("This graph could not be exported."));
      }, "image/png");
    });
    return { png, svg: standalone.svg, size, background };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const comma = text.indexOf(",");
      resolve(comma >= 0 ? text.slice(comma + 1) : text);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the export."));
    reader.readAsDataURL(blob);
  });
}
