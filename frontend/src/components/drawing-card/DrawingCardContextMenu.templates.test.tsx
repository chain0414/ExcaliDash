import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DrawingCardContextMenu } from "./DrawingCardContextMenu";

const drawing = {
  id: "drawing-1",
  name: "Original",
  collectionId: null,
  createdAt: 100,
  updatedAt: 200,
  version: 1,
};

describe("drawing actions", () => {
  it("keeps Duplicate and Save as template independent", () => {
    const onDuplicate = vi.fn();
    const onSaveAsTemplate = vi.fn();
    const { rerender } = render(
      <DrawingCardContextMenu drawing={drawing} collections={[]} position={{ x: 0, y: 0 }} isTrash={false} isShared={false} storageAvailable={false} isExporting={false} exportError={null} showMoveSubmenu={false} onShowMoveSubmenu={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} onMoveToCollection={vi.fn()} onDuplicate={onDuplicate} onSaveAsTemplate={onSaveAsTemplate} onDelete={vi.fn()} onManageStorage={vi.fn()} onExport={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save as template" }));
    expect(onSaveAsTemplate).toHaveBeenCalledWith("drawing-1");
    expect(onDuplicate).not.toHaveBeenCalled();

    rerender(
      <DrawingCardContextMenu drawing={drawing} collections={[]} position={{ x: 0, y: 0 }} isTrash={false} isShared={false} storageAvailable={false} isExporting={false} exportError={null} showMoveSubmenu={false} onShowMoveSubmenu={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} onMoveToCollection={vi.fn()} onDuplicate={onDuplicate} onSaveAsTemplate={onSaveAsTemplate} onDelete={vi.fn()} onManageStorage={vi.fn()} onExport={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(onDuplicate).toHaveBeenCalledWith("drawing-1");
    expect(onSaveAsTemplate).toHaveBeenCalledTimes(1);
  });
});
