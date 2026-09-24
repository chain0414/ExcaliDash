import type { MutableRefObject } from "react";
import * as api from "../../api";
import { reconcileElements } from "../../utils/sync";

type ReconcileRefs = {
  currentDrawingVersion: MutableRefObject<number | null>;
  excalidrawAPI: MutableRefObject<any>;
  isSyncing: MutableRefObject<boolean>;
  latestElements: MutableRefObject<readonly any[]>;
  latestFiles: MutableRefObject<any>;
  lastSyncedFiles: MutableRefObject<Record<string, any>>;
};

/**
 * On a save version conflict, reload the authoritative server scene and merge
 * it with the local edits (reconcileElements + a files union) rather than
 * blindly re-sending stale state over a newer version — the old blind retry
 * could clobber another client's concurrent work. The merged scene is pushed
 * back into the live editor so what the user sees matches what gets saved.
 */
export const reloadAndReconcile = async (
  refs: ReconcileRefs,
  drawingId: string,
  localElements: readonly any[],
  localFiles: Record<string, any>,
): Promise<{ elements: readonly any[]; files: Record<string, any> }> => {
  const remote = await api.getDrawing(drawingId);
  const remoteElements = Array.isArray(remote.elements) ? remote.elements : [];
  const remoteFiles = (remote.files as Record<string, any> | undefined) || {};
  // The save that conflicted may have waited in the queue while the user kept
  // editing. Read the live scene after the GET, otherwise resolving a 409 can
  // visibly roll the canvas back to that older queued snapshot.
  const editor = refs.excalidrawAPI.current;
  const liveElements = editor?.getSceneElementsIncludingDeleted?.() ?? refs.latestElements.current;
  const unsavedElements = reconcileElements(Array.from(localElements), liveElements);
  // Newer remote versions win; on equal metadata, preserve the unsaved local
  // edit because it has not yet reached the server.
  const mergedElements = reconcileElements(remoteElements, unsavedElements);
  const mergedFiles = {
    ...remoteFiles,
    ...localFiles,
    ...refs.latestFiles.current,
    ...(editor?.getFiles?.() ?? {}),
  };
  if (typeof remote.version === "number") {
    refs.currentDrawingVersion.current = remote.version;
  }
  if (editor) {
    refs.isSyncing.current = true;
    try {
      if (typeof editor.addFiles === "function") {
        editor.addFiles(Object.values(mergedFiles));
      }
      if (typeof editor.updateScene === "function") {
        editor.updateScene({ elements: mergedElements });
      }
    } finally {
      refs.isSyncing.current = false;
    }
  }
  refs.latestElements.current = mergedElements;
  refs.latestFiles.current = mergedFiles;
  refs.lastSyncedFiles.current = mergedFiles;
  return { elements: mergedElements, files: mergedFiles };
};
