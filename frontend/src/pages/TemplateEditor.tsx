import React, { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, exportToSvg, MainMenu } from "@excalidraw/excalidraw";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast, Toaster } from "sonner";
import * as api from "../api";
import type { DrawingTemplateDetail } from "../types";
import { useTheme } from "../context/ThemeContext";
import { getInitialLangCode } from "../components/LanguageSelector";
import { usePreference } from "../context/PreferencesContext";
import { AssetLibraryPanel } from "./editor/AssetLibraryPanel";
import { ToolbarAssetButton } from "./editor/ToolbarAssetButton";
import { getPersistedAppState, UIOptions } from "./editor/shared";

export const TemplateEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [langCode] = usePreference("language", getInitialLangCode());
  const [template, setTemplate] = useState<DrawingTemplateDetail | null>(null);
  const [name, setName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [isAssetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const excalidrawAPIRef = useRef<any>(null);
  const dirtyRef = useRef(false);
  const sceneDirtyRef = useRef(false);
  const savedSceneSignatureRef = useRef<string | null>(null);

  const sceneSignature = (elements: readonly any[], appState: any, files: Record<string, any>) =>
    JSON.stringify({ elements, appState: getPersistedAppState(appState), files });

  useEffect(() => {
    if (!id) return;
    let active = true;
    api.getTemplate(id).then((result) => {
      if (!active) return;
      setTemplate(result);
      setName(result.name);
      savedSceneSignatureRef.current = null;
      sceneDirtyRef.current = false;
    }).catch(() => { if (active) setLoadError("无法加载模板，请返回模板列表后重试。"); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const handleSceneChange = useCallback((elements: readonly any[], appState: any, files: Record<string, any>) => {
    const signature = sceneSignature(elements, appState, files);
    if (savedSceneSignatureRef.current === null) {
      savedSceneSignatureRef.current = signature;
      return;
    }
    sceneDirtyRef.current = signature !== savedSceneSignatureRef.current;
    const changed = sceneDirtyRef.current || name.trim() !== template?.name;
    dirtyRef.current = changed;
    setDirty(changed);
  }, [name, template?.name]);

  const goBack = () => {
    if (dirtyRef.current && !window.confirm("模板有未保存的修改，确定离开吗？")) return;
    navigate("/templates");
  };

  const save = async () => {
    if (!id || !template || !excalidrawAPIRef.current || saving) return;
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120) {
      toast.error("模板名称需为 1–120 个字符");
      return;
    }
    setSaving(true);
    try {
      const editor = excalidrawAPIRef.current;
      const elements = editor.getSceneElementsIncludingDeleted();
      const appState = getPersistedAppState(editor.getAppState());
      const files = { ...template.files, ...editor.getFiles() };
      const svg = await exportToSvg({
        elements: elements.filter((element: any) => !element.isDeleted),
        appState: { ...appState, exportBackground: true },
        files,
      });
      const updated = await api.updateTemplate(id, {
        name: trimmedName,
        elements,
        appState,
        files,
        preview: svg.outerHTML,
        expectedUpdatedAt: template.updatedAt,
      });
      setTemplate({ ...template, ...updated, name: trimmedName, elements, appState, files });
      savedSceneSignatureRef.current = sceneSignature(elements, appState, files);
      sceneDirtyRef.current = false;
      dirtyRef.current = false;
      setDirty(false);
      toast.success("模板已保存");
    } catch (error) {
      if (api.isAxiosError(error) && error.response?.status === 409) {
        toast.error("模板已在其他窗口修改。请刷新页面，确认新内容后再编辑。");
      } else {
        toast.error("保存模板失败，请重试；当前页面的修改仍在。");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-neutral-950">
      <header className="z-20 flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900">
        <button type="button" onClick={goBack} aria-label="返回模板列表" className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-neutral-800"><ArrowLeft size={20} /></button>
        <span className="shrink-0 text-sm font-semibold text-indigo-600 dark:text-indigo-300">编辑模板</span>
        <input aria-label="模板名称" value={name} maxLength={120} disabled={saving} onChange={(event) => { setName(event.target.value); dirtyRef.current = sceneDirtyRef.current || event.target.value.trim() !== template?.name; setDirty(dirtyRef.current); }} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 font-medium text-gray-900 outline-none focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white" />
        <span aria-live="polite" className="hidden text-sm text-gray-500 sm:inline">{dirty ? "未保存" : "已保存"}</span>
        <button type="button" onClick={() => void save()} disabled={!template || saving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} 保存修改
        </button>
      </header>
      <div ref={editorContainerRef} className="relative min-h-0 flex-1">
        {loadError ? <div role="alert" className="p-8 text-center text-rose-600">{loadError}</div> : !template ? (
          <div className="flex h-full items-center justify-center text-gray-500"><Loader2 className="mr-2 animate-spin" /> 加载模板中…</div>
        ) : (
          <Excalidraw
            key={template.id}
            theme={theme === "dark" ? "dark" : "light"}
            langCode={langCode}
            initialData={{ elements: template.elements, appState: template.appState, files: template.files, scrollToContent: true }}
            excalidrawAPI={(editor) => { excalidrawAPIRef.current = editor; }}
            onChange={handleSceneChange}
            UIOptions={UIOptions}
            viewModeEnabled={saving}
          >
            <MainMenu>
              <MainMenu.DefaultItems.ToggleTheme />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
          </Excalidraw>
        )}
        {template && <ToolbarAssetButton editorContainerRef={editorContainerRef} isOpen={isAssetLibraryOpen} onToggle={() => setAssetLibraryOpen((open) => !open)} />}
        <AssetLibraryPanel isOpen={isAssetLibraryOpen} canEdit={!saving} excalidrawAPIRef={excalidrawAPIRef} onClose={() => setAssetLibraryOpen(false)} />
      </div>
      <Toaster position="bottom-center" />
    </div>
  );
};
