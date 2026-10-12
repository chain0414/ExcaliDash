import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Drawing, DrawingSummary } from "../../types";
import { prepareExportFiles } from "../../utils/exportUtils";
import { previewHasEmbeddedImages, previewHasFlattenedMasks } from "../../utils/previewSvg";
import * as api from "../../api";

export type HydratedDrawingData = {
  elements: any[];
  appState: any;
  files: Record<string, any>;
};

const normalizeImageElementsForPreview = (
  elements: any[] = [],
  files: Record<string, any> = {},
): any[] =>
  elements.map((element) => {
    if (
      !element ||
      element.type !== "image" ||
      typeof element.fileId !== "string"
    ) {
      return element;
    }
    const file = files[element.fileId];
    const hasImageData =
      typeof file?.dataURL === "string" &&
      file.dataURL.startsWith("data:image/") &&
      file.dataURL.length > 0;
    if (!hasImageData || element.status === "saved") {
      return element;
    }
    return {
      ...element,
      status: "saved",
    };
  });

export const useDrawingPreview = (
  drawing: DrawingSummary,
  onPreviewGenerated?: (id: string, preview: string) => void,
) => {
  const hasFlattenedMasks = useMemo(
    () => previewHasFlattenedMasks(drawing.preview),
    [drawing.preview],
  );
  const [preview, setPreview] = useState(() => ({
    drawingId: drawing.id,
    svg: hasFlattenedMasks ? null : drawing.preview ?? null,
  }));
  const notifyRef = useRef(onPreviewGenerated);
  notifyRef.current = onPreviewGenerated;

  const fullDataCacheRef = useRef<{
    drawingId: string;
    data: HydratedDrawingData | null;
    promise: Promise<HydratedDrawingData> | null;
  }>({ drawingId: drawing.id, data: null, promise: null });
  if (fullDataCacheRef.current.drawingId !== drawing.id) {
    fullDataCacheRef.current = { drawingId: drawing.id, data: null, promise: null };
  }
  // Each pending request closes over its own drawing's cache. A late response
  // can complete an old export without populating the next drawing's cache.
  const fullDataCache = fullDataCacheRef.current;

  const ensureFullData = useCallback(async (): Promise<HydratedDrawingData> => {
    if (fullDataCache.data) {
      return fullDataCache.data;
    }
    if (fullDataCache.promise) {
      return fullDataCache.promise;
    }
    const promise = api
      .getDrawing(fullDataCache.drawingId)
      .then(async (fullDrawing) => {
        const files = await prepareExportFiles(
          fullDrawing.files || {},
          fullDrawing.elements || [],
        );
        const payload: HydratedDrawingData = {
          elements: fullDrawing.elements || [],
          appState: fullDrawing.appState || {},
          files,
        };
        fullDataCache.data = payload;
        fullDataCache.promise = null;
        return payload;
      })
      .catch((error) => {
        fullDataCache.promise = null;
        throw error;
      });
    fullDataCache.promise = promise;
    return promise;
  }, [fullDataCache]);

  useEffect(() => {
    let cancelled = false;
    const updatePreview = (svg: string | null) => setPreview((current) =>
      current.drawingId === drawing.id && current.svg === svg
        ? current
        : { drawingId: drawing.id, svg },
    );
    if (drawing.preview && !hasFlattenedMasks) {
      updatePreview(drawing.preview);
      return;
    }
    updatePreview(null);
    const controller = new AbortController();
    const generatePreview = async () => {
      // Previews are no longer inlined in list responses. Prefer the cheap,
      // ETag-cacheable per-drawing preview endpoint; only fall back to
      // client-side generation (which fetches full data) when the server has
      // no stored preview for this drawing.
      try {
        const stored = drawing.preview ?? await api.getDrawingPreview(drawing.id, controller.signal);
        if (cancelled) return;
        const storedHasFlattenedMasks = drawing.preview != null
          ? hasFlattenedMasks
          : previewHasFlattenedMasks(stored);
        if (stored && !storedHasFlattenedMasks) {
          updatePreview(stored);
          notifyRef.current?.(drawing.id, stored);
          return;
        }
      } catch {
        if (cancelled) return;
        // Ignore and fall through to client-side generation below.
      }
      try {
        const data = await ensureFullData();
        if (cancelled) return;
        if (!data?.elements || !data?.appState) return;

        const { exportToSvg } = await import("@excalidraw/excalidraw");
        if (cancelled) return;

        const svg = await exportToSvg({
          elements: normalizeImageElementsForPreview(
            data.elements,
            data.files || {},
          ),
          appState: {
            ...data.appState,
            exportBackground: true,
            viewBackgroundColor: data.appState.viewBackgroundColor || "#ffffff",
          },
          files: data.files || {},
          exportPadding: 10,
        });

        if (cancelled) return;
        const previewHtml = svg.outerHTML;
        updatePreview(previewHtml);
        notifyRef.current?.(drawing.id, previewHtml);
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to generate preview", e);
        }
      }
    };
    generatePreview();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [drawing.id, drawing.preview, hasFlattenedMasks, ensureFullData]);

  const buildExportDrawing = useCallback(async (): Promise<Drawing> => {
    const data = await ensureFullData();
    return {
      ...drawing,
      elements: data.elements || [],
      appState: data.appState || {},
      files: data.files || {},
    };
  }, [drawing, ensureFullData]);

  const previewSvg = preview.drawingId === drawing.id
    ? preview.svg
    : hasFlattenedMasks ? null : drawing.preview ?? null;
  return {
    previewSvg,
    hasEmbeddedImages: previewHasEmbeddedImages(previewSvg),
    buildExportDrawing,
  };
};
