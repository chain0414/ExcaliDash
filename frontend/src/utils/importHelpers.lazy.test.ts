import { afterEach, expect, it, vi } from "vitest";

vi.mock("../api", () => ({ api: {} }));

afterEach(() => {
  vi.doUnmock("@excalidraw/excalidraw");
  vi.resetModules();
});

it("loads the drawing runtime only when an import needs a preview", async () => {
  vi.resetModules();
  let runtimeLoads = 0;
  const exportToSvg = vi.fn().mockResolvedValue({ outerHTML: "<svg />" });
  vi.doMock("@excalidraw/excalidraw", () => {
    runtimeLoads += 1;
    return { exportToSvg };
  });

  const { extractDrawingData, makeSvgPreview } = await import("./importHelpers");
  expect(extractDrawingData({ elements: [], appState: {}, files: {} })).not.toBeNull();
  expect(runtimeLoads).toBe(0);

  const svg = await makeSvgPreview([], {}, {});
  expect(runtimeLoads).toBe(1);
  expect(svg.outerHTML).toBe("<svg />");
  expect(exportToSvg).toHaveBeenCalledWith(expect.objectContaining({
    elements: [],
    appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
    files: {},
  }));
});
