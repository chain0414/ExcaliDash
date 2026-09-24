import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type { DrawingAssetDetail } from "../../api/assets";

const MAX_INSERT_SIZE = 260;

const imageDimensions = (dataURL: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth || image.width || 100,
      height: image.naturalHeight || image.height || 100,
    });
    image.onerror = () => reject(new Error("Unable to decode SVG asset"));
    image.src = dataURL;
  });

/** Store the SVG bytes with the drawing, independent of the catalog entry. */
export const insertDrawingAsset = async (editor: any, asset: DrawingAssetDetail) => {
  if (
    asset.mimeType !== "image/svg+xml" ||
    !asset.dataURL.startsWith("data:image/svg+xml;base64,")
  ) {
    throw new Error("Asset is not an embedded SVG");
  }
  const dimensions = await imageDimensions(asset.dataURL);
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
  const [element] = convertToExcalidrawElements([{
    type: "image" as const,
    x, y, width, height,
    fileId: fileId as any,
    scale: [1, 1] as [number, number],
    status: "saved" as const,
    link: null,
  }]);
  editor.updateScene({
    elements: [...editor.getSceneElementsIncludingDeleted(), element],
    appState: { selectedElementIds: { [element.id]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return element.id;
};
