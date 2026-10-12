import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useDashboardCollectionActions } from "./useDashboardCollectionActions";

vi.mock("../../api", () => ({ createCollection: vi.fn(), getCollections: vi.fn() }));

describe("dashboard collection creation", () => {
  it("uses the data hook collection refresh after creating a collection", async () => {
    vi.mocked(api.createCollection).mockResolvedValue({ id: "new", name: "New", createdAt: 1 });
    const refreshCollections = vi.fn().mockResolvedValue(undefined);
    const refreshData = vi.fn();
    const { result } = renderHook(() => useDashboardCollectionActions({ selectedCollectionId: undefined, setSelectedCollectionId: vi.fn(), setCollections: vi.fn(), refreshData, refreshCollections }));
    await act(async () => { await result.current.handleCreateCollection("New"); });
    expect(api.createCollection).toHaveBeenCalledWith("New");
    expect(refreshCollections).toHaveBeenCalledTimes(1);
    expect(api.getCollections).not.toHaveBeenCalled();
    expect(refreshData).not.toHaveBeenCalled();
  });
});
