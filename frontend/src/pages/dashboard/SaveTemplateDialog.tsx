import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutTemplate, X } from "lucide-react";
import * as api from "../../api";
import type { DrawingSummary } from "../../types";

type Props = {
  drawing: Pick<DrawingSummary, "id" | "name"> | null;
  beforeSave?: () => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
};

export const SaveTemplateDialog: React.FC<Props> = ({ drawing, beforeSave, onClose, onSaved }) => {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(drawing?.name ?? "");
    setError(null);
  }, [drawing]);

  if (!drawing) return null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    let sceneSaved = !beforeSave;
    try {
      await beforeSave?.();
      sceneSaved = true;
      await api.createTemplate(drawing.id, trimmed);
      onSaved();
    } catch {
      setError(sceneSaved
        ? "Could not save this template. Please try again."
        : "Could not save the current drawing. The template was not created.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Save as template">
      <div className="absolute inset-0 bg-neutral-900/30 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }} />
      <form onSubmit={(event) => void save(event)} className="relative w-full max-w-md rounded-2xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="absolute right-4 top-4 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-50"><X size={20} /></button>
        <LayoutTemplate size={28} className="mb-3 text-indigo-600" aria-hidden="true" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Save as template</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-neutral-400">Save a snapshot of this drawing to use as the starting point for new drawings.</p>
        <label className="mt-5 block text-sm font-bold text-slate-700 dark:text-neutral-200" htmlFor="template-name">Template name</label>
        <input id="template-name" autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
        {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border-2 border-slate-200 dark:border-neutral-700 px-4 py-2 text-sm font-bold text-slate-700 dark:text-neutral-200 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={busy || !name.trim()} className="rounded-xl border-2 border-black bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving..." : "Save template"}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
};
