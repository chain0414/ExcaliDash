import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus2, LayoutTemplate, Loader2, Search, Trash2 } from "lucide-react";
import * as api from "../../api";
import type { DrawingTemplate } from "../../types";
import { ConfirmModal } from "../../components/ConfirmModal";
import { displayFontFamily } from "../../utils/displayFont";

export const TemplateGallery: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<DrawingTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DrawingTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.getTemplates()
      .then((result) => { if (active) setTemplates(result); })
      .catch(() => { if (active) setError("Could not load templates. Please try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(
    () => templates.filter((template) => template.name.toLowerCase().includes(search.trim().toLowerCase())),
    [search, templates],
  );

  const createDrawing = async (template: DrawingTemplate) => {
    setBusyId(template.id);
    setError(null);
    try {
      const drawing = await api.createDrawingFromTemplate(template.id);
      navigate(`/editor/${drawing.id}`);
    } catch {
      setError(`Could not create a drawing from “${template.name}”. Please try again.`);
    } finally {
      setBusyId(null);
    }
  };

  const removeTemplate = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setError(null);
    try {
      await api.deleteTemplate(deleteTarget.id);
      setTemplates((current) => current.filter((template) => template.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setError(`Could not delete “${deleteTarget.name}”. Please try again.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label="Templates">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-5xl text-slate-900 dark:text-white pl-1" style={{ fontFamily: displayFontFamily }}>Templates</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-neutral-400">Start a new drawing from a saved template. Your template stays unchanged.</p>
        </div>
        <label className="flex items-center gap-2 rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-slate-500 dark:text-neutral-300">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search templates</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates" className="w-48 bg-transparent text-sm outline-none placeholder:text-slate-400" />
        </label>
      </div>
      {error && <div role="alert" className="mb-5 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">{error}</div>}
      {loading ? (
        <div className="flex justify-center py-24 text-indigo-600"><Loader2 className="animate-spin" size={32} aria-label="Loading templates" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 dark:border-neutral-700 bg-white/50 dark:bg-neutral-900/50 py-20 text-center">
          <LayoutTemplate className="mx-auto mb-4 text-slate-400" size={36} aria-hidden="true" />
          <p className="font-semibold text-slate-700 dark:text-neutral-200">{search ? "No matching templates" : "No templates yet"}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-neutral-400">{search ? "Try another name." : "Open a drawing’s menu and choose Save as template."}</p>
        </div>
      ) : (
        <div className="grid gap-4 pb-16" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {filtered.map((template) => (
            <article key={template.id} className="overflow-hidden rounded-2xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]">
              <div className="aspect-[16/10] border-b-2 border-black dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 flex items-center justify-center p-4">
                {template.preview ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(template.preview)}`} alt="" className="max-h-full max-w-full object-contain" /> : <LayoutTemplate size={48} className="text-slate-300 dark:text-neutral-600" aria-hidden="true" />}
              </div>
              <div className="p-4">
                <h2 className="truncate font-bold text-slate-900 dark:text-white" title={template.name}>{template.name}</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void createDrawing(template)} disabled={busyId !== null} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border-2 border-black bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><FilePlus2 size={16} /> Use template</button>
                  <button type="button" onClick={() => setDeleteTarget(template)} disabled={busyId !== null} aria-label={`Delete template ${template.name}`} className="rounded-lg border-2 border-slate-200 dark:border-neutral-700 p-2 text-slate-500 dark:text-neutral-400 hover:text-rose-600 disabled:opacity-50"><Trash2 size={17} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <ConfirmModal isOpen={deleteTarget !== null} title="Delete Template" message={<>Delete “{deleteTarget?.name}”? Drawings created from it will remain available.</>} confirmText={busyId ? "Deleting..." : "Delete Template"} onConfirm={() => void removeTemplate()} onCancel={() => { if (!busyId) setDeleteTarget(null); }} />
    </section>
  );
};
