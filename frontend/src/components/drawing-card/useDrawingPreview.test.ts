import { act, render, renderHook, waitFor } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useDrawingPreview } from "./useDrawingPreview";
import type { DrawingSummary } from "../../types";

const exportToSvg = vi.fn();
vi.mock("@excalidraw/excalidraw", () => ({ exportToSvg: (...args: any[]) => exportToSvg(...args) }));

vi.mock("../../api", () => ({
  getDrawingPreview: vi.fn(),
  getDrawing: vi.fn(),
}));

const makeSummary = (overrides: Partial<DrawingSummary> = {}): DrawingSummary => ({
  id: "d1",
  name: "Test",
  collectionId: null,
  updatedAt: 1,
  createdAt: 1,
  version: 1,
  ...overrides,
});

describe("useDrawingPreview", () => {
  const getDrawingPreviewMock = vi.mocked(api.getDrawingPreview);
  const getDrawingMock = vi.mocked(api.getDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads each of 24 card previews once while staggered responses update the parent", async () => {
    const pending: { id: string; resolve: (preview: string) => void }[] = [];
    getDrawingPreviewMock.mockImplementation((id) => new Promise((resolve) => pending.push({ id, resolve })));
    function Card({ drawing, notify }: { drawing: DrawingSummary; notify: (id: string, preview: string) => void }) {
      const { previewSvg } = useDrawingPreview(drawing, notify);
      return createElement("div", null, previewSvg);
    }
    function Cards() {
      const [drawings, setDrawings] = useState(
        Array.from({ length: 24 }, (_, index) => makeSummary({ id: String(index) })),
      );
      const notify = (id: string, preview: string) => setDrawings((current) => current.map(
        (drawing) => drawing.id === id ? { ...drawing, preview } : drawing,
      ));
      return drawings.map((drawing) => createElement(Card, { key: drawing.id, drawing, notify }));
    }
    const { getAllByText } = render(createElement(Cards));
    for (let index = 0; index < 24; index += 1) {
      await act(async () => pending.find((request) => request.id === String(index))!.resolve("<svg>stored</svg>"));
    }
    expect(getDrawingPreviewMock).toHaveBeenCalledTimes(24);
    expect(getAllByText("<svg>stored</svg>")).toHaveLength(24);
    expect(getDrawingMock).not.toHaveBeenCalled();
  });

  it("clears the previous preview and ignores a late preview after drawing changes", async () => {
    const pending: { id: string; resolve: (preview: string) => void; signal?: AbortSignal }[] = [];
    getDrawingPreviewMock.mockImplementation((id, signal) => new Promise((resolve) => pending.push({ id, signal, resolve })));
    const notify = vi.fn();
    const { result, rerender } = renderHook(
      ({ drawing }) => useDrawingPreview(drawing, notify),
      { initialProps: { drawing: makeSummary({ preview: "<svg>initial</svg>" }) } },
    );
    expect(result.current.previewSvg).toBe("<svg>initial</svg>");
    rerender({ drawing: makeSummary({ id: "d2" }) });
    expect(result.current.previewSvg).toBeNull();
    rerender({ drawing: makeSummary({ id: "d3" }) });
    expect(pending[0].signal?.aborted).toBe(true);
    await act(async () => pending[0].resolve("<svg>old</svg>"));
    expect(result.current.previewSvg).toBeNull();
    expect(notify).not.toHaveBeenCalled();
    await act(async () => pending[1].resolve("<svg>new</svg>"));
    expect(result.current.previewSvg).toBe("<svg>new</svg>");
    expect(notify).toHaveBeenCalledWith("d3", "<svg>new</svg>");
  });

  it("keeps a pending preview request when the notification callback changes", async () => {
    let resolvePreview!: (preview: string) => void;
    getDrawingPreviewMock.mockImplementation(() => new Promise((resolve) => { resolvePreview = resolve; }));
    const first = vi.fn();
    const latest = vi.fn();
    const { result, rerender } = renderHook(
      ({ notify }) => useDrawingPreview(makeSummary(), notify),
      { initialProps: { notify: first } },
    );
    rerender({ notify: latest });
    expect(getDrawingPreviewMock).toHaveBeenCalledTimes(1);
    await act(async () => resolvePreview("<svg>stored</svg>"));
    expect(result.current.previewSvg).toBe("<svg>stored</svg>");
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith("d1", "<svg>stored</svg>");
  });

  it("does not parse the same inlined SVG again during unrelated renders", () => {
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
    const { rerender } = renderHook(
      ({ preview }) => useDrawingPreview(makeSummary({ preview })),
      { initialProps: { preview: "<svg>inline</svg>" } },
    );
    const initialParses = parse.mock.calls.length;
    expect(initialParses).toBe(1);
    rerender({ preview: "<svg>inline</svg>" });
    rerender({ preview: "<svg>inline</svg>" });
    expect(parse).toHaveBeenCalledTimes(initialParses);
    rerender({ preview: "<svg>updated</svg>" });
    expect(parse).toHaveBeenCalledTimes(initialParses + 1);
  });

  it("aborts a pending preview on unmount without falling back to full data", async () => {
    let signal: AbortSignal | undefined;
    getDrawingPreviewMock.mockImplementation((_id, requestSignal) => {
      signal = requestSignal;
      return new Promise((_resolve, reject) => requestSignal?.addEventListener("abort", () => reject(new Error("aborted"))));
    });
    const { unmount } = renderHook(() => useDrawingPreview(makeSummary()));
    expect(signal?.aborted).toBe(false);
    await act(async () => unmount());
    expect(signal?.aborted).toBe(true);
    expect(getDrawingMock).not.toHaveBeenCalled();
  });

  it("does not reuse full data from a previous drawing after its late response", async () => {
    let resolveOld!: (drawing: any) => void;
    getDrawingPreviewMock.mockResolvedValue("<svg>stored</svg>");
    getDrawingMock.mockImplementation((id) => id === "d1"
      ? new Promise((resolve) => { resolveOld = resolve; })
      : Promise.resolve({ id, elements: [{ id: "new" }], appState: {}, files: {} } as any));
    const { result, rerender } = renderHook(
      ({ id }) => useDrawingPreview(makeSummary({ id })),
      { initialProps: { id: "d1" } },
    );
    const oldExport = result.current.buildExportDrawing();
    rerender({ id: "d2" });
    await act(async () => {
      resolveOld({ id: "d1", elements: [{ id: "old" }], appState: {}, files: {} });
      await oldExport;
    });
    let exported: any;
    await act(async () => { exported = await result.current.buildExportDrawing(); });
    expect(getDrawingMock).toHaveBeenCalledWith("d2");
    expect(exported.elements).toEqual([{ id: "new" }]);
  });

  it("fetches the stored preview from the per-drawing endpoint when not inlined", async () => {
    getDrawingPreviewMock.mockResolvedValue("<svg>stored</svg>");
    const onPreviewGenerated = vi.fn();

    const { result } = renderHook(() =>
      useDrawingPreview(makeSummary(), onPreviewGenerated),
    );

    await waitFor(() => {
      expect(result.current.previewSvg).toBe("<svg>stored</svg>");
    });
    expect(getDrawingPreviewMock).toHaveBeenCalledWith("d1", expect.any(AbortSignal));
    // Stored preview must never trigger the expensive full-data fetch.
    expect(getDrawingMock).not.toHaveBeenCalled();
    // Propagated to the parent so the drag preview / cache stays populated.
    expect(onPreviewGenerated).toHaveBeenCalledWith("d1", "<svg>stored</svg>");
  });

  it("uses an inlined preview without hitting the network", async () => {
    const { result } = renderHook(() =>
      useDrawingPreview(makeSummary({ preview: "<svg>inline</svg>" })),
    );

    await waitFor(() => {
      expect(result.current.previewSvg).toBe("<svg>inline</svg>");
    });
    expect(getDrawingPreviewMock).not.toHaveBeenCalled();
    expect(getDrawingMock).not.toHaveBeenCalled();
  });

  it("falls back to full-data fetch when there is no stored preview", async () => {
    getDrawingPreviewMock.mockResolvedValue(null);
    getDrawingMock.mockResolvedValue({
      id: "d1",
      elements: [],
      appState: {},
      files: {},
    } as any);

    renderHook(() => useDrawingPreview(makeSummary()));

    await waitFor(() => {
      expect(getDrawingMock).toHaveBeenCalledWith("d1");
    });
  });

  it("regenerates a stored preview whose flattened masks cover its shapes", async () => {
    const broken = '<svg viewBox="0 0 200 100"><rect x="0" y="0" width="200" height="100" fill="#f8f5ee"/><path d="M0 0H100V60" fill="#e7f5ff"/><rect x="0" y="0" width="150" height="90" fill="#fff"/><rect x="0" y="0" width="180" height="85" fill="#fff"/></svg>';
    getDrawingPreviewMock.mockResolvedValue(broken);
    getDrawingMock.mockResolvedValue({ id: "d1", elements: [{ type: "rectangle" }], appState: {}, files: {} } as any);
    exportToSvg.mockResolvedValue({ outerHTML: "<svg>repaired</svg>" });

    const { result } = renderHook(() => useDrawingPreview(makeSummary()));
    await waitFor(() => expect(result.current.previewSvg).toBe("<svg>repaired</svg>"));
    expect(getDrawingMock).toHaveBeenCalledWith("d1");
  });

  it("rehydrates a drawing card before providing its export data", async () => {
    getDrawingPreviewMock.mockResolvedValue("<svg>stored</svg>");
    getDrawingMock.mockResolvedValue({
      id: "d1",
      elements: [{ type: "image", fileId: "icon", isDeleted: false }],
      appState: {},
      files: { icon: { id: "icon", mimeType: "image/svg+xml", dataURL: "/api/files/d1/icon" } },
    } as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: "image/svg+xml" }),
    }));

    const { result } = renderHook(() => useDrawingPreview(makeSummary()));
    let exportData: Awaited<ReturnType<typeof result.current.buildExportDrawing>> | undefined;
    await act(async () => {
      exportData = await result.current.buildExportDrawing();
    });
    expect(exportData?.files.icon.dataURL).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});
