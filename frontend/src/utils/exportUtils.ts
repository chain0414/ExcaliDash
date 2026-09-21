import type { Drawing } from "../types";
import { filesNeedRehydration, rehydrateFilesFromUrls } from "./rehydrateFiles";

export interface ExportData {
  type: "excalidraw";
  version: 2;
  source: string;
  elements: any[];
  appState: any;
  files: Record<string, any>;
}

/**
 * Export a drawing to a .excalidraw file and trigger download
 */
export const prepareExportFiles = async (
  files: Record<string, any>,
  elements: readonly any[] = [],
): Promise<Record<string, any>> => {
  const hydrated = await rehydrateFilesFromUrls(files || {});
  const missingImage = elements.some((element) =>
    element?.type === "image" &&
    !element?.isDeleted &&
    typeof element?.fileId === "string" &&
    !/^data:image\//i.test(hydrated[element.fileId]?.dataURL ?? ""),
  );
  if (filesNeedRehydration(hydrated) || missingImage) {
    throw new Error("Some drawing images could not be downloaded for export");
  }
  return hydrated;
};

export const exportDrawingToFile = async (
  drawing: Drawing,
  filename?: string
): Promise<void> => {
  const files = await prepareExportFiles(drawing.files || {}, drawing.elements || []);
  const exportData: ExportData = {
    type: "excalidraw",
    version: 2,
    source: window.location.origin,
    elements: drawing.elements || [],
    appState: {
      gridSize: drawing.appState?.gridSize ?? null,
      ...(drawing.appState?.gridStep != null && { gridStep: drawing.appState.gridStep }),
      ...(drawing.appState?.gridModeEnabled != null && { gridModeEnabled: drawing.appState.gridModeEnabled }),
      viewBackgroundColor: drawing.appState?.viewBackgroundColor ?? "#ffffff",
    },
    files,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || `${drawing.name}.excalidraw`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Export drawing from Editor with current state
 */
export const exportFromEditor = async (
  name: string,
  elements: readonly any[],
  appState: any,
  files: Record<string, any>
): Promise<void> => {
  const hydratedFiles = await prepareExportFiles(files || {}, elements);
  const exportData: ExportData = {
    type: "excalidraw",
    version: 2,
    source: window.location.origin,
    elements: Array.from(elements),
    appState: {
      gridSize: appState?.gridSize ?? null,
      ...(appState?.gridStep != null && { gridStep: appState.gridStep }),
      ...(appState?.gridModeEnabled != null && { gridModeEnabled: appState.gridModeEnabled }),
      viewBackgroundColor: appState?.viewBackgroundColor ?? "#ffffff",
    },
    files: hydratedFiles,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.excalidraw`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
