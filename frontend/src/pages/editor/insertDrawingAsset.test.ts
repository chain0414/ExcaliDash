import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "immediately" },
  convertToExcalidrawElements: (input: any[]) => input.map((item) => ({ ...item, id: "new-image" })),
  viewportCoordsToSceneCoords: () => ({ x: 300, y: 200 }),
}));

import { insertDrawingAsset } from "./insertDrawingAsset";

describe("insertDrawingAsset", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", class {
      naturalWidth = 400;
      naturalHeight = 200;
      onload: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    vi.stubGlobal("crypto", { randomUUID: () => "embedded-file" });
  });

  it("embeds SVG bytes in the drawing file store and selects the new image", async () => {
    const editor = {
      getAppState: () => ({ zoom: { value: 1 } }),
      getSceneElementsIncludingDeleted: () => [{ id: "existing" }],
      addFiles: vi.fn(),
      updateScene: vi.fn(),
    };
    const dataURL = "data:image/svg+xml;base64,PHN2Zy8+";
    await insertDrawingAsset(editor, {
      id: "catalog-item", name: "Compass", source: "test",
      mimeType: "image/svg+xml", dataURL,
      sourceUrl: "https://example.com/compass",
    });
    expect(editor.addFiles).toHaveBeenCalledWith([expect.objectContaining({
      id: "embedded-file", dataURL, mimeType: "image/svg+xml",
    })]);
    const scene = editor.updateScene.mock.calls[0][0];
    expect(scene.elements).toHaveLength(2);
    expect(scene.elements[1]).toMatchObject({
      type: "image", fileId: "embedded-file", width: 260, height: 130,
      link: "https://example.com/compass",
    });
    expect(scene.appState.selectedElementIds).toEqual({ "new-image": true });
  });

  it("rejects non-embedded catalog files", async () => {
    await expect(insertDrawingAsset({}, {
      id: "remote", name: "Remote", source: "test",
      mimeType: "image/svg+xml", dataURL: "https://example.com/icon.svg",
    })).rejects.toThrow("embedded SVG");
  });
});
