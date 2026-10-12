import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../../api";
import type { DrawingSortField, SortDirection } from "../../api";
import type { Collection, DrawingSummary } from "../../types";
import { isLatestRequest, mergeUniqueDrawings } from "./pagination";

type SelectedCollectionId = string | null | undefined;

type UseDashboardDataOptions = {
  debouncedSearch: string;
  selectedCollectionId: SelectedCollectionId;
  sortField: DrawingSortField;
  sortDirection: SortDirection;
  pageSize: number;
  onRefreshSuccess?: () => void;
};

export const useDashboardData = (options: UseDashboardDataOptions) => {
  const {
    debouncedSearch,
    selectedCollectionId,
    sortField,
    sortDirection,
    pageSize,
  } = options;
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollectionsLoading, setIsCollectionsLoading] = useState(true);
  const listRequestVersionRef = useRef(0);
  const collectionRequestVersionRef = useRef(0);
  const nextOffsetRef = useRef(0);
  const loadingRef = useRef(true);
  const fetchingMoreRef = useRef(false);
  const listControllerRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  const collectionsPendingRef = useRef(false);
  // The mount request already validates the initial URL selection.
  const collectionSelectionRef = useRef({ id: selectedCollectionId, attempted: true });

  // Stable refresh callbacks also serve mutations that finish after navigation.
  useEffect(() => {
    optionsRef.current = options;
  });

  const hasMore = drawings.length < totalCount;

  const loadPage = useCallback((offset: number, signal: AbortSignal) => {
    const query = optionsRef.current;
    const pageOptions = {
      limit: query.pageSize,
      offset,
      sortField: query.sortField,
      sortDirection: query.sortDirection,
      signal,
    };
    return query.selectedCollectionId === "shared"
      ? api.getSharedDrawings(query.debouncedSearch, pageOptions)
      : api.getDrawings(
          query.debouncedSearch,
          query.selectedCollectionId,
          pageOptions,
        );
  }, []);

  const refreshDrawings = useCallback(async () => {
    const requestVersion = ++listRequestVersionRef.current;
    listControllerRef.current?.abort();
    const controller = new AbortController();
    listControllerRef.current = controller;
    loadingRef.current = true;
    fetchingMoreRef.current = false;
    setIsLoading(true);
    setIsFetchingMore(false);
    try {
      const result = await loadPage(0, controller.signal);
      if (!isLatestRequest(requestVersion, listRequestVersionRef.current))
        return;
      setDrawings(result.drawings);
      setTotalCount(result.totalCount);
      nextOffsetRef.current = result.drawings.length;
      optionsRef.current.onRefreshSuccess?.();
    } catch (err) {
      if (!controller.signal.aborted)
        console.error("Failed to fetch drawings:", err);
    } finally {
      if (isLatestRequest(requestVersion, listRequestVersionRef.current)) {
        loadingRef.current = false;
        setIsLoading(false);
      }
    }
  }, [loadPage]);

  const refreshCollections = useCallback(async () => {
    const requestVersion = ++collectionRequestVersionRef.current;
    collectionsPendingRef.current = true;
    setIsCollectionsLoading(true);
    try {
      const result = await api.getCollections();
      if (isLatestRequest(requestVersion, collectionRequestVersionRef.current)) {
        setCollections(result);
      }
    } catch (err) {
      if (isLatestRequest(requestVersion, collectionRequestVersionRef.current)) {
        console.error("Failed to fetch collections:", err);
      }
    } finally {
      if (isLatestRequest(requestVersion, collectionRequestVersionRef.current)) {
        collectionsPendingRef.current = false;
        setIsCollectionsLoading(false);
      }
    }
  }, []);

  // Explicit refreshes after mutations update both lists, independently.
  const refreshData = useCallback(async () => {
    await Promise.all([refreshDrawings(), refreshCollections()]);
  }, [refreshDrawings, refreshCollections]);

  const fetchMore = useCallback(async () => {
    if (isFetchingMore || isLoading || fetchingMoreRef.current || !hasMore || loadingRef.current)
      return;
    const requestVersion = listRequestVersionRef.current;
    const controller = new AbortController();
    listControllerRef.current = controller;
    fetchingMoreRef.current = true;
    setIsFetchingMore(true);
    try {
      const result = await loadPage(nextOffsetRef.current, controller.signal);
      if (!isLatestRequest(requestVersion, listRequestVersionRef.current))
        return;
      setDrawings((prev) => mergeUniqueDrawings(prev, result.drawings));
      setTotalCount(result.totalCount);
      nextOffsetRef.current += result.drawings.length;
    } catch (err) {
      if (!controller.signal.aborted)
        console.error("Failed to fetch more data:", err);
    } finally {
      if (isLatestRequest(requestVersion, listRequestVersionRef.current)) {
        fetchingMoreRef.current = false;
        setIsFetchingMore(false);
      }
    }
  }, [isFetchingMore, isLoading, hasMore, loadPage]);

  useEffect(() => {
    const requestVersionRef = listRequestVersionRef;
    void refreshDrawings();
    return () => {
      ++requestVersionRef.current;
      listControllerRef.current?.abort();
    };
  }, [
    debouncedSearch,
    selectedCollectionId,
    pageSize,
    sortField,
    sortDirection,
    refreshDrawings,
  ]);

  useEffect(() => {
    const requestVersionRef = collectionRequestVersionRef;
    void refreshCollections();
    return () => {
      ++requestVersionRef.current;
    };
  }, [refreshCollections]);

  useEffect(() => {
    if (collectionSelectionRef.current.id !== selectedCollectionId) {
      collectionSelectionRef.current = { id: selectedCollectionId, attempted: false };
    }
    const isCollection = selectedCollectionId != null &&
      selectedCollectionId !== "shared" && selectedCollectionId !== "trash";
    if (!isCollection || collections.some((collection) => collection.id === selectedCollectionId))
      return;
    if (isCollectionsLoading || collectionsPendingRef.current || collectionSelectionRef.current.attempted)
      return;
    // Retry only once on entering an unknown collection, even if it is gone or
    // the request fails. Search changes must not trigger metadata retry loops.
    collectionSelectionRef.current.attempted = true;
    void refreshCollections();
  }, [selectedCollectionId, collections, isCollectionsLoading, refreshCollections]);

  useEffect(() => {
    const handleFocus = () => {
      if (!collectionsPendingRef.current) void refreshCollections();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshCollections]);

  return {
    drawings,
    setDrawings,
    collections,
    setCollections,
    totalCount,
    setTotalCount,
    isFetchingMore,
    isLoading,
    isCollectionsLoading,
    hasMore,
    refreshData,
    refreshCollections,
    fetchMore,
  };
};
