import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@excalidraw/excalidraw", () => ({
  getCommonBounds: vi.fn(() => [0, 0, 1000, 500]),
  exportToSvg: vi.fn(async () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 1120 620");
    return svg;
  }),
  exportToCanvas: vi.fn(),
}));

import { exportToCanvas, exportToSvg } from "@excalidraw/excalidraw";
import { articlePadding, DEFAULT_ARTICLE_EXPORT, exportArticlePng, exportArticleSvg } from "../articleImageExport";

const scene = [{ id: "one", type: "rectangle", x: 0, y: 0, width: 1000, height: 500, isDeleted: false }];

describe("article image export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses a useful proportional margin by default", () => {
    expect(articlePadding(scene, DEFAULT_ARTICLE_EXPORT.paddingPercent)).toBe(60);
    expect(DEFAULT_ARTICLE_EXPORT.scale).toBe(2);
    expect(DEFAULT_ARTICLE_EXPORT.background).toBe(true);
    expect(DEFAULT_ARTICLE_EXPORT.rounded).toBe(true);
  });

  it("adds a rounded background to the exported SVG itself", async () => {
    const svg = await exportArticleSvg(scene, { viewBackgroundColor: "#fffaf0" }, {}, DEFAULT_ARTICLE_EXPORT);
    expect(exportToSvg).toHaveBeenCalledWith(expect.objectContaining({ exportPadding: 60 }));
    expect(svg.querySelector("rect")?.getAttribute("fill")).toBe("#fffaf0");
    expect(Number(svg.querySelector("rect")?.getAttribute("rx"))).toBeGreaterThan(0);
    expect(svg.getAttribute("width")).toBe("2240");
    expect(svg.getAttribute("height")).toBe("1240");
  });

  it("keeps the outside transparent when background is disabled", async () => {
    const svg = await exportArticleSvg(scene, {}, {}, { ...DEFAULT_ARTICLE_EXPORT, background: false });
    expect(svg.querySelector("rect")).toBeNull();
  });

  it("clips the PNG background to rounded corners before drawing the scene", async () => {
    const nativeCanvas = document.createElement("canvas");
    nativeCanvas.width = 2240;
    nativeCanvas.height = 1240;
    vi.mocked(exportToCanvas).mockResolvedValue(nativeCanvas);
    const calls: string[] = [];
    const context = {
      beginPath: () => calls.push("begin"),
      roundRect: () => calls.push("round"),
      fill: () => calls.push("fill"),
      clip: () => calls.push("clip"),
      drawImage: () => calls.push("draw"),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as any);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));
    await exportArticlePng(scene, { viewBackgroundColor: "#fffaf0" }, {}, DEFAULT_ARTICLE_EXPORT);
    expect(exportToCanvas).toHaveBeenCalledWith(expect.objectContaining({ exportPadding: 60 }));
    expect(calls).toEqual(["begin", "round", "fill", "clip", "draw"]);
    vi.restoreAllMocks();
  });
});
