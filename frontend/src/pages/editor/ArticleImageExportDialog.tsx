import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import {
  DEFAULT_ARTICLE_EXPORT,
  downloadArticleImage,
  exportArticlePng,
  exportArticleSvg,
  type ArticleExportOptions,
} from "../../utils/articleImageExport";

export type ArticleExportScene = {
  name: string;
  elements: readonly any[];
  appState: any;
  files: Record<string, any>;
};

type Props = {
  scene: ArticleExportScene | null;
  langCode: string;
  onClose: () => void;
};

const filename = (name: string, extension: string) =>
  `${name.replace(/[\\/:*?"<>|]/g, "_").trim() || "drawing"}.${extension}`;

export const ArticleImageExportDialog: React.FC<Props> = ({ scene, langCode, onClose }) => {
  const [options, setOptions] = useState<ArticleExportOptions>(DEFAULT_ARTICLE_EXPORT);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const zh = langCode.startsWith("zh");

  useEffect(() => {
    if (!scene) return;
    setOptions(DEFAULT_ARTICLE_EXPORT);
    setError(null);
  }, [scene]);

  useEffect(() => {
    if (!scene) return;
    let cancelled = false;
    let url: string | null = null;
    setPreviewUrl(null);
    void exportArticleSvg(scene.elements, scene.appState, scene.files, { ...options, scale: 1 })
      .then((svg) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([svg.outerHTML], { type: "image/svg+xml" }));
        setPreviewUrl(url);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError(zh ? "预览生成失败，请检查画板图片。" : "Preview failed. Check the drawing images.");
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [scene, options, zh]);

  if (!scene) return null;

  const update = (changes: Partial<ArticleExportOptions>) => setOptions((current) => ({ ...current, ...changes }));
  const download = async (format: "png" | "svg") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const blob = format === "png"
        ? await exportArticlePng(scene.elements, scene.appState, scene.files, options)
        : new Blob([(await exportArticleSvg(scene.elements, scene.appState, scene.files, options)).outerHTML], { type: "image/svg+xml" });
      downloadArticleImage(blob, filename(scene.name, format));
    } catch {
      setError(zh ? "导出失败，请检查画板图片后重试。" : "Export failed. Check the drawing images and try again.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={zh ? "导出图片" : "Export image"}>
      <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }} />
      <div className="relative grid w-full max-w-5xl gap-6 rounded-2xl bg-white p-6 shadow-2xl dark:bg-neutral-900 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <button type="button" aria-label={zh ? "关闭" : "Close"} onClick={onClose} disabled={busy} className="absolute right-4 top-4 rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-neutral-800"><X size={20} /></button>
        <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0] p-5 dark:bg-neutral-800">
          {previewUrl ? <img src={previewUrl} alt={zh ? "导出预览" : "Export preview"} className="max-h-[65vh] max-w-full object-contain shadow-lg" /> : <span className="text-sm text-gray-500">{zh ? "正在生成预览…" : "Generating preview…"}</span>}
        </div>
        <div className="flex flex-col gap-5 pr-3">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{zh ? "导出图片" : "Export image"}</h2>
          <label className="flex items-center justify-between text-sm text-gray-800 dark:text-gray-200">
            {zh ? "背景" : "Background"}
            <input type="checkbox" checked={options.background} onChange={(event) => update({ background: event.target.checked })} className="h-5 w-5 accent-indigo-600" />
          </label>
          <label className="flex items-center justify-between text-sm text-gray-800 dark:text-gray-200">
            {zh ? "圆角背景" : "Rounded background"}
            <input type="checkbox" checked={options.rounded} disabled={!options.background} onChange={(event) => update({ rounded: event.target.checked })} className="h-5 w-5 accent-indigo-600" />
          </label>
          <label className="text-sm text-gray-800 dark:text-gray-200">
            <span className="flex justify-between"><span>{zh ? "四周留白" : "Outer padding"}</span><span>{options.paddingPercent}%</span></span>
            <input type="range" min="3" max="12" step="1" value={options.paddingPercent} onChange={(event) => update({ paddingPercent: Number(event.target.value) })} className="mt-2 w-full accent-indigo-600" />
          </label>
          <fieldset className="text-sm text-gray-800 dark:text-gray-200">
            <legend>{zh ? "缩放比例" : "Scale"}</legend>
            <div className="mt-2 flex gap-2">
              {([1, 2, 3] as const).map((scale) => <button key={scale} type="button" aria-pressed={options.scale === scale} onClick={() => update({ scale })} className={`rounded-lg border px-4 py-2 ${options.scale === scale ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-300 dark:border-neutral-600"}`}>{scale}×</button>)}
            </div>
          </fieldset>
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{zh ? "默认按画幅宽度留出约 6% 边距；圆角会写入导出的 PNG 和 SVG，四角透明。" : "The default padding is about 6% of the drawing width. Rounded corners are included in the PNG and SVG files."}</p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="mt-auto flex gap-3">
            <button type="button" disabled={busy} onClick={() => void download("png")} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50"><Download size={18} /> PNG</button>
            <button type="button" disabled={busy} onClick={() => void download("svg")} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50"><Download size={18} /> SVG</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
