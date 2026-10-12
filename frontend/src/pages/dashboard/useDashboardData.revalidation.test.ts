import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useDashboardData } from "./useDashboardData";

vi.mock("../../api", () => ({ getDrawings: vi.fn(), getCollections: vi.fn() }));
const options = {
  debouncedSearch: "",
  selectedCollectionId: undefined as string | undefined,
  sortField: "updatedAt" as const,
  sortDirection: "desc" as "asc" | "desc",
  pageSize: 24,
};
const collection = (id: string, sharedRole: "view" | "edit" = "view") => ({
  id, name: id, createdAt: 1, isOwner: false, sharedRole,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getDrawings).mockResolvedValue({ drawings: [], totalCount: 0 });
});

describe("dashboard collection metadata revalidation", () => {
  it("loads metadata once when navigating to a newly shared unknown collection", async () => {
    vi.mocked(api.getCollections)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([collection("new", "edit")]);
    const { result, rerender } = renderHook((query) => useDashboardData(query), { initialProps: options });
    await waitFor(() => expect(result.current.isCollectionsLoading).toBe(false));
    rerender({ ...options, selectedCollectionId: "new" });
    await waitFor(() => expect(result.current.collections[0]?.sharedRole).toBe("edit"));
    expect(api.getCollections).toHaveBeenCalledTimes(2);
    rerender({ ...options, selectedCollectionId: "new", debouncedSearch: "search", sortDirection: "asc" });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(api.getCollections).toHaveBeenCalledTimes(2);
  });

  it("does not repeat the initial collection request for a missing initial URL selection", async () => {
    const initial = deferred<ReturnType<typeof collection>[]>();
    vi.mocked(api.getCollections).mockReturnValue(initial.promise);
    const { result, rerender } = renderHook((query) => useDashboardData(query), {
      initialProps: { ...options, selectedCollectionId: "missing" },
    });
    expect(api.getCollections).toHaveBeenCalledTimes(1);
    await act(async () => initial.resolve([]));
    await waitFor(() => expect(result.current.isCollectionsLoading).toBe(false));
    rerender({ ...options, selectedCollectionId: "missing", debouncedSearch: "search" });
    expect(api.getCollections).toHaveBeenCalledTimes(1);
  });

  it("waits for metadata already in flight before checking the new selection", async () => {
    const initial = deferred<ReturnType<typeof collection>[]>();
    vi.mocked(api.getCollections).mockReturnValueOnce(initial.promise).mockResolvedValueOnce([collection("new")]);
    const { result, rerender } = renderHook((query) => useDashboardData(query), { initialProps: options });
    rerender({ ...options, selectedCollectionId: "new" });
    expect(api.getCollections).toHaveBeenCalledTimes(1);
    await act(async () => initial.resolve([]));
    await waitFor(() => expect(result.current.collections[0]?.id).toBe("new"));
    expect(api.getCollections).toHaveBeenCalledTimes(2);
  });

  it("uses an in-flight response containing the new selection without another request", async () => {
    const initial = deferred<ReturnType<typeof collection>[]>();
    vi.mocked(api.getCollections).mockReturnValue(initial.promise);
    const { result, rerender } = renderHook((query) => useDashboardData(query), { initialProps: options });
    rerender({ ...options, selectedCollectionId: "new" });
    await act(async () => initial.resolve([collection("new")]));
    await waitFor(() => expect(result.current.isCollectionsLoading).toBe(false));
    expect(api.getCollections).toHaveBeenCalledTimes(1);
  });

  it("does not loop or retry a failed unknown selection during searches", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(api.getCollections).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("offline"));
    const { result, rerender } = renderHook((query) => useDashboardData(query), { initialProps: options });
    await waitFor(() => expect(result.current.isCollectionsLoading).toBe(false));
    rerender({ ...options, selectedCollectionId: "missing" });
    await waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    rerender({ ...options, selectedCollectionId: "missing", debouncedSearch: "again" });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(api.getCollections).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it("refreshes changed roles and new shares on focus, deduplicates pending focus, and removes the listener", async () => {
    const updated = deferred<ReturnType<typeof collection>[]>();
    vi.mocked(api.getCollections).mockResolvedValueOnce([collection("known")]).mockReturnValueOnce(updated.promise);
    const { result, unmount } = renderHook(() => useDashboardData(options));
    await waitFor(() => expect(result.current.isCollectionsLoading).toBe(false));
    act(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("focus")); });
    expect(api.getCollections).toHaveBeenCalledTimes(2);
    await act(async () => updated.resolve([collection("known", "edit"), collection("new")]));
    expect(result.current.collections.map((item) => [item.id, item.sharedRole])).toEqual([["known", "edit"], ["new", "view"]]);
    expect(api.getDrawings).toHaveBeenCalledTimes(1);
    unmount();
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(api.getCollections).toHaveBeenCalledTimes(2);
  });
});
