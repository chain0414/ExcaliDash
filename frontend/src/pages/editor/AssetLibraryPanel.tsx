import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  API_URL, getDrawingAsset, getDrawingAssetCatalog, recordDrawingAssetUse,
  type DrawingAsset,
} from "../../api";
import { assetCategory, byUsage, CATEGORY_LABELS, matchesAssetQuery, shuffledCategoryOrder, type AssetCategory } from "./assetCategories";
import { insertDrawingAsset } from "./insertDrawingAsset";

type Props = {
  isOpen: boolean;
  canEdit: boolean;
  excalidrawAPIRef: React.MutableRefObject<any>;
  onClose: () => void;
};
type Tab = "all" | "recommended";

const assetPreviewUrl = (asset: DrawingAsset) =>
  `${API_URL.replace(/\/$/, "")}/assets/${encodeURIComponent(asset.id)}/svg`;

export const AssetLibraryPanel: React.FC<Props> = ({ isOpen, canEdit, excalidrawAPIRef, onClose }) => {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [category, setCategory] = useState<AssetCategory | null>(null);
  const [assets, setAssets] = useState<DrawingAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(60);
  const [allCategoryOrder] = useState(shuffledCategoryOrder);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError(false);
    getDrawingAssetCatalog(controller.signal)
      .then((catalog) => { if (!cancelled) setAssets(catalog); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { window.clearTimeout(timeout); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [isOpen, retry]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<AssetCategory, number>();
    for (const asset of assets) counts.set(assetCategory(asset), (counts.get(assetCategory(asset)) ?? 0) + 1);
    return counts;
  }, [assets]);
  const categoryUsage = useMemo(() => {
    const counts = new Map<AssetCategory, number>();
    for (const asset of assets) counts.set(assetCategory(asset), (counts.get(assetCategory(asset)) ?? 0) + (asset.usageCount ?? 0));
    return counts;
  }, [assets]);
  const recommendedCategories = useMemo(() => CATEGORY_LABELS
    .filter((label) => (categoryUsage.get(label) ?? 0) > 0)
    .sort((a, b) => (categoryUsage.get(b) ?? 0) - (categoryUsage.get(a) ?? 0)), [categoryUsage]);
  const filtered = useMemo(() => assets
    .filter((asset) => matchesAssetQuery(asset, search))
    .filter((asset) => !category || assetCategory(asset) === category)
    .filter((asset) => tab === "all" || (categoryUsage.get(assetCategory(asset)) ?? 0) > 0)
    .sort(byUsage), [assets, search, category, tab, categoryUsage]);
  const frequent = useMemo(() => assets.filter((asset) => (asset.usageCount ?? 0) > 0)
    .sort(byUsage).slice(0, 9), [assets]);
  const categories = tab === "recommended" ? recommendedCategories : allCategoryOrder.filter((label) => categoryCounts.has(label));
  const grouped = !search.trim() && !category;

  const insert = async (asset: DrawingAsset) => {
    if (!canEdit || !excalidrawAPIRef.current || insertingId) return;
    setInsertingId(asset.id);
    try {
      const detail = await getDrawingAsset(asset.id);
      await insertDrawingAsset(excalidrawAPIRef.current, detail);
      toast.success(`已插入 ${asset.name}`);
      try {
        const usage = await recordDrawingAssetUse(asset.id);
        setAssets((current) => current.map((item) => item.id === asset.id
          ? { ...item, usageCount: usage.usageCount, lastUsedAt: usage.lastUsedAt } : item));
      } catch {
        toast.warning("图标已插入，使用记录暂未保存");
      }
    } catch {
      toast.error("插入图标失败，请重试");
    } finally {
      setInsertingId(null);
    }
  };

  const card = (asset: DrawingAsset) => (
    <button type="button" key={asset.id}
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
      {(asset.usageCount ?? 0) > 0 && <span className="w-full truncate text-[10px] text-indigo-600 dark:text-indigo-300">已用 {asset.usageCount} 次</span>}
    </button>
  );

  if (!isOpen) return null;
  return (
    <aside aria-label="手绘图标库" className="absolute top-3 right-3 bottom-3 z-30 w-[min(400px,calc(100vw-24px))] rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-neutral-700">
        <div><h2 className="font-semibold text-gray-900 dark:text-gray-100">手绘图标库</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">中文或英文搜索，点击图标插入画板</p></div>
        <button type="button" aria-label="关闭手绘图标库" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800"><X size={18} /></button>
      </div>
      <div role="tablist" aria-label="图标列表" className="flex gap-2 px-4 pt-3">
        {([ ["all", "全部图标"], ["recommended", "推荐"] ] as const).map(([value, label]) =>
          <button key={value} type="button" role="tab" aria-selected={tab === value}
            onClick={() => { setTab(value); setCategory(null); setVisibleCount(60); }}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-gray-200"}`}>{label}</button>)}
      </div>
      <label className="mx-4 mt-3 flex items-center gap-2 border border-gray-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-gray-500">
        <Search size={17} />
        <input aria-label="搜索手绘图标" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(60); }}
          placeholder="搜索图标，例如：飞机、地图、database"
          className="min-w-0 flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100" />
      </label>
      {!loading && !error && <div aria-label="图标分类" className="flex gap-1.5 overflow-x-auto px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
        <button type="button" aria-pressed={category === null} onClick={() => { setCategory(null); setVisibleCount(60); }}
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${!category ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900" : "bg-gray-100 dark:bg-neutral-800"}`}>全部</button>
        {categories.map((label) => <button key={label} type="button" aria-pressed={category === label}
          onClick={() => { setCategory(label); setVisibleCount(60); }}
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${category === label ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900" : "bg-gray-100 dark:bg-neutral-800"}`}>{label} {categoryCounts.get(label)}</button>)}
      </div>}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && <p role="status" className="text-sm text-gray-500 flex gap-2 items-center"><Loader2 size={16} className="animate-spin" />正在加载图标…</p>}
        {error && <div role="alert" className="text-sm text-red-700 dark:text-red-300">加载图标失败。<button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>重试</button></div>}
        {!loading && !error && tab === "recommended" && recommendedCategories.length === 0 &&
          <p className="text-sm text-gray-500">还没有使用记录。先从“全部图标”插入图标，推荐和偏好分类会随使用更新。</p>}
        {!loading && !error && filtered.length === 0 && (tab === "all" || recommendedCategories.length > 0) &&
          <p className="text-sm text-gray-500">没有找到匹配的图标。</p>}
        {!loading && !error && grouped && frequent.length > 0 && <section className="mb-5">
          <h3 className="mb-2 font-medium text-sm text-gray-700 dark:text-gray-200">常用图标</h3>
          <div className="grid grid-cols-3 gap-2">{frequent.map(card)}</div>
        </section>}
        {!loading && !error && filtered.length > 0 && (grouped ? categories.map((label) => {
          const items = filtered.filter((asset) => assetCategory(asset) === label);
          if (!items.length) return null;
          return <section key={label} className="mb-5">
            <div className="mb-2 flex items-center justify-between"><h3 className="font-medium text-sm text-gray-700 dark:text-gray-200">{label}</h3>
              <button type="button" className="text-xs text-indigo-600 dark:text-indigo-300" onClick={() => { setCategory(label); setVisibleCount(60); }}>查看全部 {items.length}</button></div>
            <div className="grid grid-cols-3 gap-2">{items.slice(0, 9).map(card)}</div>
          </section>;
        }) : <><div className="grid grid-cols-3 gap-2">{filtered.slice(0, visibleCount).map(card)}</div>
          {filtered.length > visibleCount && <button type="button" onClick={() => setVisibleCount((n) => n + 60)} className="mt-3 w-full rounded-lg border border-gray-300 dark:border-neutral-700 px-3 py-2 text-sm">显示更多</button>}</>)}
      </div>
      {!canEdit && <p className="px-4 py-2 text-xs text-amber-700 border-t dark:text-amber-300">This drawing is read-only.</p>}
      <p className="px-4 py-2 text-[11px] text-gray-500 border-t border-gray-200 dark:border-neutral-700">
        云端 SVG 会嵌入画板；画布内的“素材库”用于保存 Excalidraw 组件。来源：
        <a href="https://icon-sets.iconify.design/streamline-freehand/" target="_blank" rel="noopener noreferrer" className="underline">Streamline Freehand</a>
        {" · "}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="underline">CC BY 4.0</a>。
        公开使用时可在页面说明中署名，无需写在图面上。
      </p>
    </aside>
  );
};
