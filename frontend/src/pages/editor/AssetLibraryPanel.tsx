import React, { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  API_URL,
  getDrawingAsset,
  searchDrawingAssets,
  type DrawingAsset,
} from "../../api";
import { insertDrawingAsset } from "./insertDrawingAsset";

type Props = {
  isOpen: boolean;
  canEdit: boolean;
  excalidrawAPIRef: React.MutableRefObject<any>;
  onClose: () => void;
};

const assetPreviewUrl = (asset: DrawingAsset) =>
  `${API_URL.replace(/\/$/, "")}/assets/${encodeURIComponent(asset.id)}/svg`;

export const AssetLibraryPanel: React.FC<Props> = ({
  isOpen,
  canEdit,
  excalidrawAPIRef,
  onClose,
}) => {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<DrawingAsset[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setAssets([]);
    setNextCursor(null);
    searchDrawingAssets(query)
      .then((result) => {
        if (cancelled) return;
        setAssets(result.assets);
        setNextCursor(result.nextCursor || null);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, query, retry]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await searchDrawingAssets(query, nextCursor);
      setAssets((current) => [...current, ...result.assets]);
      setNextCursor(result.nextCursor || null);
    } catch {
      toast.error("加载更多图标失败");
    } finally {
      setLoadingMore(false);
    }
  };

  const insert = async (asset: DrawingAsset) => {
    if (!canEdit || !excalidrawAPIRef.current || insertingId) return;
    setInsertingId(asset.id);
    try {
      const detail = await getDrawingAsset(asset.id);
      await insertDrawingAsset(excalidrawAPIRef.current, detail);
      toast.success(`已插入 ${asset.name}`);
    } catch {
      toast.error("插入图标失败，请重试");
    } finally {
      setInsertingId(null);
    }
  };

  if (!isOpen) return null;
  return (
    <aside
      aria-label="手绘图标库"
      className="absolute top-3 right-3 bottom-3 z-30 w-[min(380px,calc(100vw-24px))] rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-2xl flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-neutral-700">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">手绘图标库</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">可用中文或英文搜索，点击图标插入画板</p>
        </div>
        <button type="button" aria-label="关闭手绘图标库" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800"><X size={18} /></button>
      </div>
      <label className="mx-4 mt-3 flex items-center gap-2 border border-gray-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-gray-500">
        <Search size={17} />
        <input
          aria-label="搜索手绘图标"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索图标，例如：飞机、地图、database"
          className="min-w-0 flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100"
        />
      </label>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && <p role="status" className="text-sm text-gray-500 flex gap-2 items-center"><Loader2 size={16} className="animate-spin" />正在加载图标…</p>}
        {error && <div role="alert" className="text-sm text-red-700 dark:text-red-300">加载图标失败。<button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>重试</button></div>}
        {!loading && !error && assets.length === 0 && <p className="text-sm text-gray-500">没有找到匹配的图标。</p>}
        <div className="grid grid-cols-3 gap-2">
          {assets.map((asset) => (
            <button
              type="button"
              key={asset.id}
              title={`${asset.name} · ${asset.source}${asset.license ? ` · ${asset.license}` : ""}`}
              aria-label={`插入 ${asset.name}`}
              disabled={!canEdit || insertingId !== null}
              onClick={() => void insert(asset)}
              className="min-w-0 flex flex-col items-center gap-2 rounded-lg border border-gray-200 dark:border-neutral-700 p-2 text-gray-800 dark:text-gray-200 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              <span className="w-14 h-14 flex items-center justify-center">
                <img src={assetPreviewUrl(asset)} alt="" loading="lazy" className="max-w-full max-h-full" />
              </span>
              <span className="w-full truncate text-xs font-medium">{asset.name}</span>
              <span className="w-full truncate text-[10px] text-gray-500">{asset.source}</span>
            </button>
          ))}
        </div>
        {nextCursor && !loading && <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="mt-3 w-full rounded-lg border border-gray-300 dark:border-neutral-700 px-3 py-2 text-sm disabled:opacity-50">{loadingMore ? "正在加载…" : "加载更多"}</button>}
      </div>
      {!canEdit && <p className="px-4 py-2 text-xs text-amber-700 border-t dark:text-amber-300">This drawing is read-only.</p>}
      <p className="px-4 py-2 text-[11px] text-gray-500 border-t border-gray-200 dark:border-neutral-700">此处是云端 SVG 图标；画布内的“素材库”用于保存 Excalidraw 组件。插入的 SVG 会嵌入画板。</p>
    </aside>
  );
};
