import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { exportToSvg } from "@excalidraw/excalidraw";
import debounce from "lodash/debounce";
import { toast } from "sonner";
import * as api from "../../api";
import { reloadAndReconcile } from "./reconcileSave";
import { compressExcalidrawFiles } from "../../utils/imageCompression";
import {
  applyUploadedFileRefs,
  getFilesDelta,
  getPersistedAppState,
  hasRenderableElements,
} from "./shared";
import type { UploadedFileRefs } from "./shared";

class DrawingSaveConflictError extends Error {
  constructor(message = "Drawing version conflict") {
    super(message);
    this.name = "DrawingSaveConflictError";
  }
}

type SaveOptions = { suppressErrors?: boolean; retry?: boolean };

const isTransientSaveError = (err: unknown): boolean =>
  api.isAxiosError(err) &&
  (!err.response || [408, 429, 500, 502, 503, 504, 520, 522, 524].includes(err.response.status));

const shouldRetrySave = (err: unknown): boolean =>
  err instanceof DrawingSaveConflictError || isTransientSaveError(err);

type PersistenceRefs = {
  currentDrawingVersion: MutableRefObject<number | null>;
  debouncedSave: MutableRefObject<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files?: Record<string, any>,
      ) => void)
    | null
  >;
  excalidrawAPI: MutableRefObject<any>;
  isSyncing: MutableRefObject<boolean>;
  isUnmounting: MutableRefObject<boolean>;
  lastLocalChangeAt: MutableRefObject<number>;
  lastPersistedElements: MutableRefObject<readonly any[]>;
  lastPersistedFiles: MutableRefObject<Record<string, any>>;
  lastSyncedFiles: MutableRefObject<Record<string, any>>;
  latestAppState: MutableRefObject<any>;
  latestElements: MutableRefObject<readonly any[]>;
  latestFiles: MutableRefObject<any>;
  saveQueue: MutableRefObject<Promise<void>>;
  suspiciousBlankLoad: MutableRefObject<boolean>;
  uploadedRefs: MutableRefObject<UploadedFileRefs>;
};

type UseEditorPersistenceParams = {
  refs: PersistenceRefs;
  user: unknown;
  normalizeImageElementStatus: (
    elements?: readonly any[],
    files?: Record<string, any> | null,
  ) => readonly any[];
  resolveSafeSnapshot: (candidateSnapshot?: readonly any[]) => {
    snapshot: readonly any[];
    prevented: boolean;
    staleEmptySnapshot: boolean;
    staleNonRenderableSnapshot: boolean;
  };
};

export const useEditorPersistence = ({
  refs,
  user,
  normalizeImageElementStatus,
  resolveSafeSnapshot,
}: UseEditorPersistenceParams) => {
  const saveDataRef = useRef<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files?: Record<string, any>,
      ) => Promise<void>)
    | null
  >(null);
  const savePreviewRef = useRef<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files: any,
      ) => Promise<void>)
    | null
  >(null);
  const saveLibraryRef = useRef<((items: any[]) => Promise<void>) | null>(null);
  const [autosaveFailing, setAutosaveFailing] = useState(false);
  const autosaveFailureCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const retryDelayRef = useRef(2000);
  const enqueueSceneSaveRef = useRef<((
    drawingId: string,
    elements: readonly any[],
    appState: any,
    files?: Record<string, any>,
    options?: SaveOptions,
  ) => Promise<void>) | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback((drawingId: string) => {
    if (retryTimerRef.current !== null || refs.isUnmounting.current) return;
    const delay = retryDelayRef.current;
    retryDelayRef.current = Math.min(delay * 2, 30_000);
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      if (refs.isUnmounting.current || !refs.latestAppState.current) return;
      void enqueueSceneSaveRef.current?.(
        drawingId,
        refs.latestElements.current,
        refs.latestAppState.current,
        refs.latestFiles.current,
        { retry: true },
      );
    }, delay);
  }, [refs]);

  saveDataRef.current = async (
    drawingId: string,
    elements: readonly any[],
    appState: any,
    files?: Record<string, any>,
  ) => {
    if (!drawingId) return;
    const persistableAppState = getPersistedAppState(appState);
    const candidateElements = Array.isArray(elements) ? elements : [];
    const {
      snapshot: safeElements,
      prevented,
      staleEmptySnapshot,
      staleNonRenderableSnapshot,
    } = resolveSafeSnapshot(candidateElements);
    const persistableElements = Array.from(safeElements);
    if (
      refs.suspiciousBlankLoad.current &&
      !hasRenderableElements(persistableElements)
    ) {
      console.warn(
        "[Editor] Blocking non-renderable save due to suspicious blank load",
        { drawingId, elementCount: persistableElements.length },
      );
      return;
    }
    if (staleEmptySnapshot || staleNonRenderableSnapshot) {
      console.warn("[Editor] Skipping stale snapshot save", {
        drawingId,
        candidateElementCount: candidateElements.length,
        fallbackElementCount: persistableElements.length,
        prevented,
        staleEmptySnapshot,
        staleNonRenderableSnapshot,
      });
      return;
    }
    let persistableFiles = files ?? refs.latestFiles.current ?? {};
    const compressedFilesResult =
      await compressExcalidrawFiles(persistableFiles);
    if (compressedFilesResult.changed) {
      persistableFiles = compressedFilesResult.files;
      if (
        refs.excalidrawAPI.current &&
        typeof refs.excalidrawAPI.current.addFiles === "function"
      ) {
        refs.isSyncing.current = true;
        try {
          refs.excalidrawAPI.current.addFiles(
            Object.values(persistableFiles),
          );
        } finally {
          refs.isSyncing.current = false;
        }
      }
      refs.latestFiles.current = persistableFiles;
      refs.lastSyncedFiles.current = persistableFiles;
    }
    // Swap inline bytes for a ref on any file already uploaded out-of-band so
    // the PUT ships KB, not MB. Files not yet uploaded keep their inline
    // dataURL and the server interns them — no data loss on an upload race.
    const filesToPersist = applyUploadedFileRefs(
      persistableFiles,
      refs.uploadedRefs.current,
    );
    const filesChangedSincePersist =
      Object.keys(
        getFilesDelta(
          refs.lastPersistedFiles.current || {},
          filesToPersist || {},
        ),
      ).length > 0;
    const normalizedElementsForSave = Array.from(
      normalizeImageElementStatus(persistableElements, filesToPersist),
    );
    const persistScene = async (
      attempt: number,
      elementsToSave: readonly any[],
      filesToSave: Record<string, any>,
      sendFiles: boolean,
    ): Promise<void> => {
      try {
        const updated = await api.updateDrawing(drawingId, {
          elements: Array.from(elementsToSave),
          appState: attempt > 0
            ? getPersistedAppState(refs.latestAppState.current ?? appState)
            : persistableAppState,
          ...(sendFiles ? { files: filesToSave } : {}),
          version: refs.currentDrawingVersion.current ?? undefined,
        });
        if (typeof updated.version === "number") {
          refs.currentDrawingVersion.current = updated.version;
        }
        refs.lastPersistedElements.current = elementsToSave;
        if (sendFiles) {
          refs.lastPersistedFiles.current = filesToSave;
        }
      } catch (err) {
        if (api.isAxiosError(err) && err.response?.status === 409) {
          if (attempt === 0) {
            const reconciled = await reloadAndReconcile(
              refs,
              drawingId,
              elementsToSave,
              filesToSave,
            );
            await persistScene(1, reconciled.elements, reconciled.files, true);
            return;
          }
          throw new DrawingSaveConflictError();
        }
        throw err;
      }
    };
    await persistScene(
      0,
      normalizedElementsForSave,
      filesToPersist,
      filesChangedSincePersist,
    );
  };

  const enqueueSceneSave = useCallback(
    (
      drawingId: string,
      elements: readonly any[],
      appState: any,
      files?: Record<string, any>,
      options?: SaveOptions,
    ) => {
      const suppressErrors = options?.suppressErrors ?? true;
      if (!options?.retry) clearRetryTimer();
      refs.saveQueue.current = refs.saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (!saveDataRef.current) return;
          try {
            await saveDataRef.current(drawingId, elements, appState, files);
            clearRetryTimer();
            retryDelayRef.current = 2000;
            // A successful save (autosave or explicit) clears the indicator.
            if (autosaveFailureCountRef.current !== 0) {
              autosaveFailureCountRef.current = 0;
              setAutosaveFailing(false);
              toast.success("画布已重新保存");
            }
          } catch (err) {
            const firstFailure = autosaveFailureCountRef.current === 0;
            autosaveFailureCountRef.current += 1;
            setAutosaveFailing(true);
            if (firstFailure) {
              console.error("Failed to save drawing", {
                status: api.isAxiosError(err) ? err.response?.status : undefined,
                code: api.isAxiosError(err) ? err.code : undefined,
              });
            }
            if (firstFailure || !suppressErrors) {
              toast.error(err instanceof DrawingSaveConflictError
                ? "画布版本冲突，修改尚未保存；将自动重试"
                : isTransientSaveError(err)
                  ? "网络异常，画布尚未保存；恢复连接后会自动重试"
                  : "画布尚未保存，请检查错误后重试");
            }
            if (shouldRetrySave(err)) scheduleRetry(drawingId);
            if (suppressErrors) return;
            throw err;
          }
        });
      return refs.saveQueue.current;
    },
    [clearRetryTimer, refs, scheduleRetry],
  );
  enqueueSceneSaveRef.current = enqueueSceneSave;

  useEffect(() => {
    if (!autosaveFailing) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [autosaveFailing]);

  savePreviewRef.current = async (
    drawingId: string,
    elements: readonly any[],
    appState: any,
    files: any,
  ) => {
    if (!drawingId) return;
    try {
      const snapshotFromArgs = Array.isArray(elements) ? elements : [];
      const snapshotFromRef = refs.latestElements.current ?? [];
      const candidateSnapshot =
        hasRenderableElements(snapshotFromArgs) ||
        !hasRenderableElements(snapshotFromRef)
          ? snapshotFromArgs
          : snapshotFromRef;
      const {
        snapshot: currentSnapshot,
        prevented: preventedPreviewOverwrite,
      } = resolveSafeSnapshot(candidateSnapshot);
      const currentFiles = refs.latestFiles.current ?? files;
      const normalizedSnapshot = normalizeImageElementStatus(
        currentSnapshot,
        currentFiles,
      );
      if (
        refs.suspiciousBlankLoad.current &&
        !hasRenderableElements(currentSnapshot)
      ) {
        return;
      }
      if (preventedPreviewOverwrite) {
        console.warn("[Editor] Prevented stale snapshot preview overwrite", {
          drawingId,
          fallbackElementCount: currentSnapshot.length,
        });
      }
      const svg = await exportToSvg({
        elements: normalizedSnapshot,
        skipInliningFonts: true,
        appState: {
          ...appState,
          exportBackground: true,
          viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
        },
        files: currentFiles,
      });
      await api.updateDrawing(drawingId, { preview: svg.outerHTML });
    } catch (err) {
      console.error("Failed to save preview", err);
    }
  };

  saveLibraryRef.current = async (items: any[]) => {
    if (!user) return;
    try {
      await api.updateLibrary(items);
    } catch (err) {
      console.error("Failed to save library", err);
      if (api.isAxiosError(err) && err.response?.status === 401) return;
      toast.error("Failed to save library");
    }
  };

  const debouncedSave = useCallback(
    debounce((drawingId, elements, appState, files) => {
      enqueueSceneSave(drawingId, elements, appState, files);
    }, 1000),
    [enqueueSceneSave],
  );
  refs.debouncedSave.current = debouncedSave;

  const debouncedSavePreview = useCallback(
    debounce((drawingId: string) => {
      if (!savePreviewRef.current || !drawingId) return;
      if (refs.isUnmounting.current || refs.isSyncing.current) return;
      const expectedChangeAt = refs.lastLocalChangeAt.current;
      const run = () => {
        if (!savePreviewRef.current) return;
        if (refs.isUnmounting.current || refs.isSyncing.current) return;
        if (refs.lastLocalChangeAt.current !== expectedChangeAt) return;
        const appState = refs.latestAppState.current;
        if (!appState) return;
        void savePreviewRef.current(
          drawingId,
          refs.latestElements.current,
          appState,
          refs.latestFiles.current || {},
        );
      };
      const w = window as any;
      if (typeof w.requestIdleCallback === "function") {
        w.requestIdleCallback(run, { timeout: 2000 });
      } else {
        setTimeout(run, 0);
      }
    }, 30_000),
    [refs],
  );

  const debouncedSaveLibrary = useCallback(
    debounce((items: any[]) => {
      if (saveLibraryRef.current) saveLibraryRef.current(items);
    }, 1000),
    [],
  );

  useEffect(() => {
    return () => {
      // Flush pending scene/library saves on unmount so a fast navigation
      // away doesn't drop the user's last debounced edits. The preview is a
      // regenerable thumbnail, so it is safe to cancel.
      debouncedSave.flush();
      debouncedSaveLibrary.flush();
      debouncedSavePreview.cancel();
      clearRetryTimer();
    };
  }, [clearRetryTimer, debouncedSave, debouncedSaveLibrary, debouncedSavePreview]);

  return {
    autosaveFailing,
    debouncedSave,
    debouncedSaveLibrary,
    debouncedSavePreview,
    enqueueSceneSave,
    saveDataRef,
    savePreviewRef,
  };
};
