import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type { DrawingAssetDetail } from "../../api/assets";

const MAX_INSERT_SIZE = 260;

const imageDimensions = (dataURL: string): { width: number; height: number } => {
  const encoded = dataURL.slice("data:image/svg+xml;base64,".length);
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  const svg = new DOMParser().parseFromString(new TextDecoder().decode(bytes), "image/svg+xml");
  const viewBox = svg.documentElement.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (svg.documentElement.localName !== "svg" || viewBox?.length !== 4 ||
    viewBox.some((value) => !Number.isFinite(value)) || viewBox[2] <= 0 || viewBox[3] <= 0) {
    throw new Error("Invalid SVG asset viewBox");
  }
  return { width: viewBox[2], height: viewBox[3] };
};

/** Store the SVG bytes with the drawing, independent of the catalog entry. */
export const insertDrawingAsset = async (editor: any, asset: DrawingAssetDetail) => {
  const startedAt = performance.now();
  if (
    asset.mimeType !== "image/svg+xml" ||
    !asset.dataURL.startsWith("data:image/svg+xml;base64,")
  ) {
    throw new Error("Asset is not an embedded SVG");
  }
  const dimensions = imageDimensions(asset.dataURL);
  const decodedAt = performance.now();
  const scale = Math.min(1, MAX_INSERT_SIZE / Math.max(dimensions.width, dimensions.height));
  const width = Math.max(1, Math.round(dimensions.width * scale));
  const height = Math.max(1, Math.round(dimensions.height * scale));
  const appState = editor.getAppState();
  const center = viewportCoordsToSceneCoords(
    { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 },
    appState,
  );
  const x = center.x - width / 2;
  const y = center.y - height / 2;
  const fileId = crypto.randomUUID();
  editor.addFiles([{ id: fileId, mimeType: asset.mimeType, dataURL: asset.dataURL, created: Date.now() }]);
  const filesAddedAt = performance.now();
  const [element] = convertToExcalidrawElements([{
    type: "image" as const,
    x, y, width, height,
    fileId: fileId as any,
    scale: [1, 1] as [number, number],
    status: "saved" as const,
    link: null,
  }]);
  const elementCreatedAt = performance.now();
  editor.updateScene({
    elements: [...editor.getSceneElementsIncludingDeleted(), element],
    appState: { selectedElementIds: { [element.id]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  const sceneUpdatedAt = performance.now();
  if (sceneUpdatedAt - startedAt > 1000) {
    console.warn("[AssetLibrary] Slow SVG insertion", {
      decodeMs: Math.round(decodedAt - startedAt),
      addFilesMs: Math.round(filesAddedAt - decodedAt),
      createElementMs: Math.round(elementCreatedAt - filesAddedAt),
      updateSceneMs: Math.round(sceneUpdatedAt - elementCreatedAt),
    });
  }
  return element.id;
};
