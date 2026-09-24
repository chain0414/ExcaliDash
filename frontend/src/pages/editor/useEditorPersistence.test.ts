import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { exportToSvg } from "@excalidraw/excalidraw";
import { useEditorPersistence } from "./useEditorPersistence";

vi.mock("@excalidraw/excalidraw", () => ({ exportToSvg: vi.fn() }));
vi.mock("../../api", () => ({
  updateDrawing: vi.fn(),
  getDrawing: vi.fn(),
  isAxiosError: vi.fn(() => false),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock("../../utils/imageCompression", () => ({
  compressExcalidrawFiles: vi.fn(async (files: any) => ({
    changed: false,
    files,
  })),
}));

const makeRefs = () => ({
  currentDrawingVersion: { current: 1 as number | null },
  debouncedSave: { current: null as any },
  excalidrawAPI: { current: null as any },
  isSyncing: { current: false },
  isUnmounting: { current: false },
  lastLocalChangeAt: { current: 0 },
  lastPersistedElements: { current: [] as readonly any[] },
  lastPersistedFiles: { current: {} as Record<string, any> },
  lastSyncedFiles: { current: {} as Record<string, any> },
  latestAppState: { current: {} as any },
  latestElements: { current: [] as readonly any[] },
  latestFiles: { current: {} as any },
  saveQueue: { current: Promise.resolve() },
  suspiciousBlankLoad: { current: false },
  uploadedRefs: { current: {} as Record<string, string> },
});

const params = (refs: ReturnType<typeof makeRefs>) => ({
  refs,
  user: { id: "u1" },
  normalizeImageElementStatus: (els?: readonly any[]) => els ?? [],
  resolveSafeSnapshot: (s?: readonly any[]) => ({
    snapshot: s ?? [],
    prevented: false,
    staleEmptySnapshot: false,
    staleNonRenderableSnapshot: false,
  }),
});

const els = [{ id: "a", type: "rectangle", version: 1 }];

describe("useEditorPersistence autosave indicator", () => {
  const updateDrawing = vi.mocked(api.updateDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("raises autosaveFailing on the first failure and clears on success", async () => {
    updateDrawing.mockRejectedValue(new Error("network"));
    const refs = makeRefs();
    const { result } = renderHook(() => useEditorPersistence(params(refs)));

    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, {});
    });

    await waitFor(() => expect(result.current.autosaveFailing).toBe(true));
    const unsafeReload = new Event("beforeunload", { cancelable: true });
    expect(window.dispatchEvent(unsafeReload)).toBe(false);

    // A subsequent successful save clears the indicator.
    updateDrawing.mockResolvedValue({ version: 2 } as any);
    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, {});
    });
    await waitFor(() => expect(result.current.autosaveFailing).toBe(false));
    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
  });

  it("retries a network failure with the latest scene without another edit", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(api.isAxiosError).mockImplementation((error: any) => error?.isAxiosError === true);
      updateDrawing
        .mockRejectedValueOnce({ isAxiosError: true, code: "ERR_NETWORK" })
        .mockResolvedValue({ version: 2 } as any);
      const refs = makeRefs();
      refs.latestElements.current = els;
      refs.latestAppState.current = {};
      const { result, unmount } = renderHook(() => useEditorPersistence(params(refs)));

      await act(async () => {
        await result.current.enqueueSceneSave("d1", els, {}, {});
      });
      expect(result.current.autosaveFailing).toBe(true);
      expect(updateDrawing).toHaveBeenCalledTimes(1);

      const newer = [{ id: "a", type: "rectangle", version: 2, x: 42 }];
      refs.latestElements.current = newer;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
        await refs.saveQueue.current;
      });

      expect(updateDrawing).toHaveBeenCalledTimes(2);
      expect(updateDrawing.mock.calls[1][1].elements).toEqual(newer);
      expect(result.current.autosaveFailing).toBe(false);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a newer live edit when a queued save hits a version conflict", async () => {
    vi.mocked(api.isAxiosError).mockImplementation((error: any) => error?.isAxiosError === true);
    updateDrawing
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 409 } })
      .mockResolvedValue({ version: 3 } as any);
    vi.mocked(api.getDrawing).mockResolvedValue({
      version: 2,
      elements: [{ id: "a", type: "rectangle", version: 1, updated: 1, x: 10 }],
      files: {},
    } as any);
    const newer = [{ id: "a", type: "rectangle", version: 1, updated: 1, x: 42 }];
    const refs = makeRefs();
    refs.latestElements.current = newer;
    refs.excalidrawAPI.current = {
      getSceneElementsIncludingDeleted: () => newer,
      getFiles: () => ({}),
      updateScene: vi.fn(),
      addFiles: vi.fn(),
    };
    const { result } = renderHook(() => useEditorPersistence(params(refs)));

    await act(async () => {
      await result.current.enqueueSceneSave("d1", [
        { id: "a", type: "rectangle", version: 1, updated: 1, x: 10 },
      ], {}, {}, { suppressErrors: false });
    });

    expect(updateDrawing.mock.calls[1][1].elements).toEqual(newer);
    expect(refs.excalidrawAPI.current.updateScene).toHaveBeenCalledWith({ elements: newer });
    expect(result.current.autosaveFailing).toBe(false);
  });

  it("retries after two consecutive version conflicts", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(api.isAxiosError).mockImplementation((error: any) => error?.isAxiosError === true);
      updateDrawing
        .mockRejectedValueOnce({ isAxiosError: true, response: { status: 409 } })
        .mockRejectedValueOnce({ isAxiosError: true, response: { status: 409 } })
        .mockResolvedValue({ version: 4 } as any);
      vi.mocked(api.getDrawing).mockResolvedValue({
        version: 2, elements: els, files: {},
      } as any);
      const refs = makeRefs();
      refs.latestElements.current = els;
      refs.latestAppState.current = {};
      const { result, unmount } = renderHook(() => useEditorPersistence(params(refs)));

      await act(async () => {
        await result.current.enqueueSceneSave("d1", els, {}, {});
      });
      expect(result.current.autosaveFailing).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
        await refs.saveQueue.current;
      });
      expect(updateDrawing).toHaveBeenCalledTimes(3);
      expect(result.current.autosaveFailing).toBe(false);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useEditorPersistence file ref substitution", () => {
  const updateDrawing = vi.mocked(api.updateDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
    updateDrawing.mockResolvedValue({ version: 2 } as any);
  });

  const inlineFiles = (id: string) => ({
    [id]: {
      id,
      mimeType: "image/webp",
      created: 1,
      dataURL: "data:image/webp;base64,QUJD",
    },
  });

  const bodyOf = () => updateDrawing.mock.calls[0][1] as any;

  it("ships an uploaded file as a ref and drops the base64 bytes", async () => {
    const refs = makeRefs();
    refs.uploadedRefs.current = { a: "/api/files/d1/a" };
    const { result } = renderHook(() => useEditorPersistence(params(refs)));

    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, inlineFiles("a"), {
        suppressErrors: false,
      });
    });

    expect(updateDrawing).toHaveBeenCalledTimes(1);
    expect(bodyOf().files.a.dataURL).toBe("/api/files/d1/a");
    expect(bodyOf().files.a.dataURL.startsWith("data:")).toBe(false);
    // lastPersistedFiles records the ref-shaped entry it actually sent.
    expect(refs.lastPersistedFiles.current.a.dataURL).toBe("/api/files/d1/a");
  });

  it("keeps inline bytes for a file that has not been uploaded", async () => {
    const refs = makeRefs(); // uploadedRefs empty
    const { result } = renderHook(() => useEditorPersistence(params(refs)));

    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, inlineFiles("a"), {
        suppressErrors: false,
      });
    });

    expect(bodyOf().files.a.dataURL.startsWith("data:")).toBe(true);
  });

  it("falls back to inline when uploads are unsupported (old server)", async () => {
    // When the per-file upload endpoint 404s, the upload hook never records a
    // ref, so uploadedRefs stays empty and the scene PUT keeps the inline bytes
    // exactly as today's behavior — the server interns them.
    const refs = makeRefs();
    const { result } = renderHook(() => useEditorPersistence(params(refs)));

    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, inlineFiles("a"), {
        suppressErrors: false,
      });
    });

    expect(bodyOf().files.a.dataURL.startsWith("data:")).toBe(true);
  });
});

describe("useEditorPersistence unmount flush", () => {
  const updateDrawing = vi.mocked(api.updateDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
    updateDrawing.mockResolvedValue({ version: 2 } as any);
  });

  it("flushes a pending debounced save on unmount instead of cancelling it", async () => {
    const refs = makeRefs();
    const { result, unmount } = renderHook(() =>
      useEditorPersistence(params(refs)),
    );

    // Queue a debounced save; without a flush-on-unmount it would be dropped.
    act(() => {
      result.current.debouncedSave("d1", els, {}, {});
    });
    expect(updateDrawing).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(updateDrawing).toHaveBeenCalledTimes(1));
  });
});

describe("useEditorPersistence preview export", () => {
  it("skips font inlining for the regenerable thumbnail", async () => {
    vi.clearAllMocks();
    vi.mocked(exportToSvg).mockResolvedValue({ outerHTML: "<svg/>" } as SVGSVGElement);
    vi.mocked(api.updateDrawing).mockResolvedValue({ version: 2 } as any);
    const refs = makeRefs();
    const { result } = renderHook(() => useEditorPersistence(params(refs)));

    await act(async () => {
      await result.current.savePreviewRef.current?.("d1", els, {}, {});
    });

    expect(exportToSvg).toHaveBeenCalledWith(expect.objectContaining({ skipInliningFonts: true }));
    expect(api.updateDrawing).toHaveBeenCalledWith("d1", { preview: "<svg/>" });
  });
});
