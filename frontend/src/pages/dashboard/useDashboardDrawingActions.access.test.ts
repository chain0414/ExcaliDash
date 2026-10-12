import { act, renderHook } from "@testing-library/react";
import type { DragEvent } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import * as api from "../../api";
import type { Collection } from "../../types";
import { useDashboardDrawingActions } from "./useDashboardDrawingActions";

vi.mock("../../api", () => ({
  createDrawing: vi.fn().mockResolvedValue({ id: "new-drawing" }),
  updateDrawing: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

const setup = (selectedCollectionId: string | undefined, collections: Collection[] = []) => {
  const uploadFiles = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useDashboardDrawingActions({
    drawings: [],
    setDrawings: vi.fn(),
    collections,
    selectedCollectionId,
    selectedIds: new Set(),
    setSelectedIds: vi.fn(),
    setTotalCount: vi.fn(),
    uploadFiles,
    refreshData: vi.fn(),
    navigate: vi.fn(),
  }));
  return { result, uploadFiles };
};

it("does not assume ownership before a selected collection's permissions arrive", async () => {
  const { result, uploadFiles } = setup("pending-collection");
  await act(async () => {
    await result.current.handleCreateDrawing();
    await result.current.handleImportDrawings([new File(["{}"], "drawing.json")] as unknown as FileList);
  });
  expect(result.current.isSharedCollection).toBe(true);
  expect(api.createDrawing).not.toHaveBeenCalled();
  expect(uploadFiles).not.toHaveBeenCalled();
});

it("blocks file drops into a collection whose permissions are unavailable", async () => {
  const { result, uploadFiles } = setup("pending-collection");
  await act(async () => {
    await result.current.handleDrop({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { files: [new File(["{}"], "drawing.json")] },
    } as unknown as DragEvent, "pending-collection");
  });
  expect(uploadFiles).not.toHaveBeenCalled();
});

it("still allows creation on the homepage before sidebar collections load", async () => {
  const { result } = setup(undefined);
  await act(async () => { await result.current.handleCreateDrawing(); });
  expect(api.createDrawing).toHaveBeenCalledWith("Untitled Drawing", null);
});

it("uses known owner permissions while collection data is being refreshed", async () => {
  const { result } = setup("owned", [{ id: "owned", name: "Owned", createdAt: 1, isOwner: true }]);
  await act(async () => { await result.current.handleCreateDrawing(); });
  expect(api.createDrawing).toHaveBeenCalledWith("Untitled Drawing", "owned");
});
