import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GalleryVerticalEnd } from "lucide-react";
import clsx from "clsx";

type Props = {
  editorContainerRef: React.RefObject<HTMLDivElement>;
  isOpen: boolean;
  onToggle: () => void;
};

export const ToolbarAssetButton = ({ editorContainerRef, isOpen, onToggle }: Props) => {
  const [host, setHost] = useState<HTMLSpanElement | null>(null);

  useEffect(() => {
    const root = editorContainerRef.current;
    if (!root) return;

    const slot = document.createElement("span");
    slot.className = "flex items-center excalidash-asset-toolbar-slot";
    setHost(slot);

    let frame = 0;
    const place = () => {
      frame = 0;
      const eraser = root.querySelector('[data-testid="toolbar-eraser"]')?.closest("label");
      if (eraser?.parentElement) {
        if (eraser.nextElementSibling !== slot) eraser.after(slot);
      } else {
        slot.remove();
      }
    };
    const schedulePlace = () => {
      if (!frame) frame = window.requestAnimationFrame(place);
    };

    place();
    const observer = new MutationObserver(schedulePlace);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      slot.remove();
      setHost(null);
    };
  }, [editorContainerRef]);

  if (!host) return null;
  return createPortal(
    <button
      type="button"
      aria-label="手绘图标库"
      aria-pressed={isOpen}
      title="手绘图标库：搜索并插入 SVG 图标"
      onClick={onToggle}
      className={clsx(
        "flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-neutral-700",
        isOpen && "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200",
      )}
    >
      <GalleryVerticalEnd size={20} aria-hidden="true" />
    </button>,
    host,
  );
};
