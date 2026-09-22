import { exportToCanvas, exportToSvg, getCommonBounds } from "@excalidraw/excalidraw";
import { prepareExportFiles } from "./exportUtils";

export type ArticleExportOptions = {
  background: boolean;
  rounded: boolean;
  paddingPercent: number;
  scale: 1 | 2 | 3;
};

export const DEFAULT_ARTICLE_EXPORT: ArticleExportOptions = {
  background: true,
  rounded: true,
  paddingPercent: 6,
  scale: 2,
};

export const articlePadding = (elements: readonly any[], percent: number): number => {
  const [minX, , maxX] = getCommonBounds(elements as any[]);
  const width = Math.max(1, maxX - minX);
  return Math.round(Math.min(240, Math.max(36, width * percent / 100)));
};

const activeElements = (elements: readonly any[]) => elements.filter((element) => !element.isDeleted);

const dimensions = (svg: SVGSVGElement): { width: number; height: number } => {
  const values = (svg.getAttribute("viewBox") || "").trim().split(/\s+/).map(Number);
  if (values.length !== 4 || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) {
    throw new Error("Cannot determine exported image dimensions");
  }
  return { width: values[2], height: values[3] };
};

export const exportArticleSvg = async (
  elements: readonly any[], appState: any, files: Record<string, any>, options: ArticleExportOptions,
): Promise<SVGSVGElement> => {
  const visible = activeElements(elements);
  if (!visible.length) throw new Error("The drawing is empty");
  const hydratedFiles = await prepareExportFiles(files, visible);
  const padding = articlePadding(visible, options.paddingPercent);
  const svg = await exportToSvg({
    elements: visible as any,
    files: hydratedFiles as any,
    appState: { ...appState, exportBackground: false, exportScale: 1 },
    exportPadding: padding,
  });
  const { width, height } = dimensions(svg);
  if (options.background) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("fill", appState?.viewBackgroundColor || "#ffffff");
    if (options.rounded) rect.setAttribute("rx", String(Math.min(48, Math.max(20, padding * 0.45))));
    svg.insertBefore(rect, svg.firstChild);
  }
  svg.setAttribute("width", String(Math.round(width * options.scale)));
  svg.setAttribute("height", String(Math.round(height * options.scale)));
  return svg;
};

export const exportArticlePng = async (
  elements: readonly any[], appState: any, files: Record<string, any>, options: ArticleExportOptions,
): Promise<Blob> => {
  const visible = activeElements(elements);
  if (!visible.length) throw new Error("The drawing is empty");
  const hydratedFiles = await prepareExportFiles(files, visible);
  const padding = articlePadding(visible, options.paddingPercent);
  const nativeCanvas = await exportToCanvas({
    elements: visible as any,
    files: hydratedFiles as any,
    appState: { ...appState, exportBackground: false, exportScale: options.scale },
    exportPadding: padding,
  });
  const canvas = document.createElement("canvas");
  canvas.width = nativeCanvas.width;
  canvas.height = nativeCanvas.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  if (options.background) {
    context.fillStyle = appState?.viewBackgroundColor || "#ffffff";
    context.beginPath();
    if (options.rounded) {
      context.roundRect(0, 0, canvas.width, canvas.height, Math.min(48, Math.max(20, padding * 0.45)) * options.scale);
    } else {
      context.rect(0, 0, canvas.width, canvas.height);
    }
    context.fill();
    context.clip();
  }
  context.drawImage(nativeCanvas, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not encode PNG")), "image/png");
  });
};

export const downloadArticleImage = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
};
