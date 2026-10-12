import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useDashboardData } from "./useDashboardData";

vi.mock("../../api", () => ({
  getDrawings: vi.fn(),
  getCollections: vi.fn(),
  getSharedDrawings: vi.fn(),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const makeDrawing = (id: string) => ({
  id,
  name: id,
  collectionId: null,
  createdAt: 1,
  updatedAt: 1,
  version: 1,
  preview: null,
});

const makeCollection = (id: string) => ({
  id,
  name: id,
  createdAt: 1,
});

describe("useDashboardData", () => {
  const getDrawingsMock = vi.mocked(api.getDrawings);
  const getCollectionsMock = vi.mocked(api.getCollections);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads drawings and collections on mount", async () => {
    getDrawingsMock.mockResolvedValue({
      drawings: [makeDrawing("d1")],
      totalCount: 1,
      limit: 24,
      offset: 0,
    });
    getCollectionsMock.mockResolvedValue([makeCollection("c1")]);

    const onRefreshSuccess = vi.fn();
    const { result } = renderHook(() =>
      useDashboardData({
        debouncedSearch: "",
        selectedCollectionId: undefined,
        sortField: "updatedAt",
        sortDirection: "desc",
        pageSize: 24,
        onRefreshSuccess,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(getDrawingsMock).toHaveBeenCalledWith("", undefined, expect.objectContaining({
      limit: 24,
      offset: 0,
      sortField: "updatedAt",
      sortDirection: "desc",
    }));
    expect(getCollectionsMock).toHaveBeenCalledTimes(1);
    expect(result.current.drawings.map((drawing) => drawing.id)).toEqual(["d1"]);
    expect(result.current.collections.map((collection) => collection.id)).toEqual(["c1"]);
    expect(result.current.totalCount).toBe(1);
    expect(onRefreshSuccess).toHaveBeenCalledTimes(1);
  });

  it("fetches more drawings and merges unique results", async () => {
    getDrawingsMock
      .mockResolvedValueOnce({
        drawings: [makeDrawing("d1"), makeDrawing("d2")],
        totalCount: 3,
        limit: 24,
        offset: 0,
      })
      .mockResolvedValueOnce({
        drawings: [makeDrawing("d2"), makeDrawing("d3")],
        totalCount: 3,
        limit: 24,
        offset: 2,
      });
    getCollectionsMock.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useDashboardData({
        debouncedSearch: "",
        selectedCollectionId: undefined,
        sortField: "updatedAt",
        sortDirection: "desc",
        pageSize: 24,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.fetchMore();
    });

    expect(getDrawingsMock).toHaveBeenNthCalledWith(2, "", undefined, expect.objectContaining({
      limit: 24,
      offset: 2,
      sortField: "updatedAt",
      sortDirection: "desc",
    }));
    expect(result.current.drawings.map((drawing) => drawing.id)).toEqual(["d1", "d2", "d3"]);
    expect(result.current.hasMore).toBe(false);
  });

  it("ignores stale refresh responses from older requests", async () => {
    const firstDrawings = deferred<{
      drawings: ReturnType<typeof makeDrawing>[];
      totalCount: number;
      limit: number;
      offset: number;
    }>();
    const secondDrawings = deferred<{
      drawings: ReturnType<typeof makeDrawing>[];
      totalCount: number;
      limit: number;
      offset: number;
    }>();
    const firstCollections = deferred<ReturnType<typeof makeCollection>[]>();

    getDrawingsMock
      .mockReturnValueOnce(firstDrawings.promise as ReturnType<typeof api.getDrawings>)
      .mockReturnValueOnce(secondDrawings.promise as ReturnType<typeof api.getDrawings>);
    getCollectionsMock
      .mockReturnValueOnce(firstCollections.promise as ReturnType<typeof api.getCollections>);

    const { result, rerender } = renderHook(
      (search: string) =>
        useDashboardData({
          debouncedSearch: search,
          selectedCollectionId: undefined,
          sortField: "updatedAt",
          sortDirection: "desc",
          pageSize: 24,
        }),
      { initialProps: "first" }
    );

    rerender("second");

    await act(async () => {
      secondDrawings.resolve({
        drawings: [makeDrawing("new")],
        totalCount: 1,
        limit: 24,
        offset: 0,
      });

      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.drawings.map((drawing) => drawing.id)).toEqual(["new"]);
    });

    await act(async () => {
      firstDrawings.resolve({
        drawings: [makeDrawing("old")],
        totalCount: 1,
        limit: 24,
        offset: 0,
      });
      firstCollections.resolve([makeCollection("old-collection")]);
      await Promise.resolve();
    });

    expect(result.current.drawings.map((drawing) => drawing.id)).toEqual(["new"]);
    expect(result.current.collections.map((collection) => collection.id)).toEqual([
      "old-collection",
    ]);
  });

  it("drops deleted shared collections after refresh", async () => {
    getDrawingsMock.mockResolvedValue({
      drawings: [makeDrawing("d1")],
      totalCount: 1,
      limit: 24,
      offset: 0,
    });
    getCollectionsMock
      .mockResolvedValueOnce([makeCollection("shared-a"), makeCollection("shared-b")])
      .mockResolvedValueOnce([makeCollection("shared-a")]);

    const { result } = renderHook(() =>
      useDashboardData({
        debouncedSearch: "",
        selectedCollectionId: undefined,
        sortField: "updatedAt",
        sortDirection: "desc",
        pageSize: 24,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.collections.map((collection) => collection.id)).toEqual([
      "shared-a",
      "shared-b",
    ]);

    await act(async () => {
      await result.current.refreshData();
    });

    expect(result.current.collections.map((collection) => collection.id)).toEqual([
      "shared-a",
    ]);
  });
});


describe("dashboard query performance", () => {
  const page = (id: string, count = 1) => ({ drawings: [makeDrawing(id)], totalCount: count, limit: 24, offset: 0 });
  const options = { debouncedSearch: "", selectedCollectionId: undefined as string | undefined, sortField: "updatedAt" as const, sortDirection: "desc" as "asc" | "desc", pageSize: 24 };
  beforeEach(() => vi.resetAllMocks());

  it("shows drawings while collections are still loading", async () => {
    const collections = deferred<ReturnType<typeof makeCollection>[]>();
    vi.mocked(api.getDrawings).mockResolvedValue(page("ready"));
    vi.mocked(api.getCollections).mockReturnValue(collections.promise);
    const { result } = renderHook(() => useDashboardData(options));
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("ready"));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isCollectionsLoading).toBe(true);
    await act(async () => collections.resolve([makeCollection("c1")]));
    expect(result.current.isCollectionsLoading).toBe(false);
    expect(result.current.collections[0]?.id).toBe("c1");
  });

  it("does not refetch collections for search, sorting or collection navigation", async () => {
    vi.mocked(api.getDrawings).mockResolvedValue(page("d1"));
    vi.mocked(api.getCollections).mockResolvedValue([makeCollection("c1")]);
    const { result, rerender } = renderHook((query) => useDashboardData(query), { initialProps: options });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender({ ...options, debouncedSearch: "new" });
    await waitFor(() => expect(vi.mocked(api.getDrawings)).toHaveBeenCalledTimes(2));
    rerender({ ...options, selectedCollectionId: "c1" });
    await waitFor(() => expect(vi.mocked(api.getDrawings)).toHaveBeenCalledTimes(3));
    rerender({ ...options, sortDirection: "asc" });
    await waitFor(() => expect(vi.mocked(api.getDrawings)).toHaveBeenCalledTimes(4));
    expect(api.getCollections).toHaveBeenCalledTimes(1);
  });

  it("ignores old collection responses after an explicit collection refresh", async () => {
    const initial = deferred<ReturnType<typeof makeCollection>[]>();
    vi.mocked(api.getDrawings).mockResolvedValue(page("d1"));
    vi.mocked(api.getCollections).mockReturnValueOnce(initial.promise).mockResolvedValueOnce([makeCollection("latest")]);
    const { result } = renderHook(() => useDashboardData(options));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.refreshCollections(); });
    await act(async () => initial.resolve([makeCollection("obsolete")]));
    expect(result.current.collections.map((c) => c.id)).toEqual(["latest"]);
    expect(result.current.isCollectionsLoading).toBe(false);
    expect(api.getDrawings).toHaveBeenCalledTimes(1);
  });

  it("refreshes the active query when an older mutation callback finishes", async () => {
    vi.mocked(api.getDrawings).mockResolvedValue(page("d1"));
    vi.mocked(api.getCollections).mockResolvedValue([]);
    const { result, rerender } = renderHook((query) => useDashboardData(query), { initialProps: options });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const mutationRefresh = result.current.refreshData;
    rerender({ ...options, selectedCollectionId: "active", debouncedSearch: "current" });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await mutationRefresh(); });
    expect(api.getDrawings).toHaveBeenLastCalledWith("current", "active", expect.objectContaining({ offset: 0 }));
  });

  it("routes Shared with me queries to the shared drawing endpoint", async () => {
    vi.mocked(api.getSharedDrawings).mockResolvedValue(page("shared"));
    vi.mocked(api.getCollections).mockResolvedValue([]);
    const { result } = renderHook(() => useDashboardData({ ...options, selectedCollectionId: "shared" }));
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("shared"));
    expect(api.getSharedDrawings).toHaveBeenCalledWith("", expect.objectContaining({ limit: 24, offset: 0, signal: expect.any(AbortSignal) }));
    expect(api.getDrawings).not.toHaveBeenCalled();
  });

  it("cancels obsolete searches and avoids reporting expected cancellation", async () => {
    const first = deferred<ReturnType<typeof page>>();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(api.getDrawings).mockReturnValueOnce(first.promise).mockResolvedValueOnce(page("new"));
    vi.mocked(api.getCollections).mockResolvedValue([]);
    const { result, rerender, unmount } = renderHook((query) => useDashboardData(query), { initialProps: options });
    const firstSignal = vi.mocked(api.getDrawings).mock.calls[0][2]?.signal;
    rerender({ ...options, debouncedSearch: "new" });
    expect(firstSignal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("new"));
    await act(async () => first.reject(new Error("canceled")));
    expect(error).not.toHaveBeenCalled();
    const currentSignal = vi.mocked(api.getDrawings).mock.calls[1][2]?.signal;
    unmount();
    expect(currentSignal?.aborted).toBe(true);
    error.mockRestore();
  });

  it("ignores obsolete pagination and its loading cleanup after a new query", async () => {
    const oldMore = deferred<ReturnType<typeof page>>();
    const newMore = deferred<ReturnType<typeof page>>();
    vi.mocked(api.getDrawings).mockResolvedValueOnce(page("old", 3)).mockReturnValueOnce(oldMore.promise).mockResolvedValueOnce(page("new", 3)).mockReturnValueOnce(newMore.promise);
    vi.mocked(api.getCollections).mockResolvedValue([]);
    const { result, rerender } = renderHook((query) => useDashboardData(query), { initialProps: options });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let oldPromise: Promise<void>;
    act(() => { oldPromise = result.current.fetchMore(); });
    rerender({ ...options, debouncedSearch: "new" });
    await waitFor(() => expect(result.current.drawings[0]?.id).toBe("new"));
    let newPromise: Promise<void>;
    act(() => { newPromise = result.current.fetchMore(); });
    await act(async () => { oldMore.resolve(page("obsolete")); await oldPromise!; });
    expect(result.current.drawings.map((d) => d.id)).toEqual(["new"]);
    expect(result.current.isFetchingMore).toBe(true);
    await act(async () => { newMore.resolve(page("next")); await newPromise!; });
    expect(result.current.drawings.map((d) => d.id)).toEqual(["new", "next"]);
    expect(result.current.isFetchingMore).toBe(false);
  });

  it("serializes concurrent load-more calls at the same offset", async () => {
    const more = deferred<ReturnType<typeof page>>();
    vi.mocked(api.getDrawings).mockResolvedValueOnce(page("first", 3)).mockReturnValueOnce(more.promise);
    vi.mocked(api.getCollections).mockResolvedValue([]);
    const { result } = renderHook(() => useDashboardData(options));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let first: Promise<void>;
    act(() => { first = result.current.fetchMore(); void result.current.fetchMore(); });
    expect(api.getDrawings).toHaveBeenCalledTimes(2);
    await act(async () => { more.resolve(page("next")); await first!; });
  });
});
