import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DrawingSummary } from "../../types";
import { useDashboardDrawingActions } from "./useDashboardDrawingActions";

describe("dashboard preview notifications", () => {
  it("keeps the notification callback stable and preserves state for an identical preview", () => {
    const initial: DrawingSummary = { id: "d1", name: "Test", collectionId: null, createdAt: 1, updatedAt: 1, version: 1 };
    const { result, rerender } = renderHook(() => {
      const [drawings, setDrawings] = useState([initial]);
      const actions = useDashboardDrawingActions({
        drawings, setDrawings, collections: [], selectedCollectionId: undefined,
        selectedIds: new Set(), setSelectedIds: vi.fn(), setTotalCount: vi.fn(),
        uploadFiles: vi.fn(), refreshData: vi.fn(), navigate: vi.fn(),
      });
      return { drawings, notify: actions.handlePreviewGenerated };
    });
    const notify = result.current.notify;
    rerender();
    expect(result.current.notify).toBe(notify);
    act(() => notify("d1", "<svg>stored</svg>"));
    const updated = result.current.drawings;
    expect(updated[0].preview).toBe("<svg>stored</svg>");
    act(() => notify("d1", "<svg>stored</svg>"));
    expect(result.current.drawings).toBe(updated);
    act(() => notify("missing", "<svg>stored</svg>"));
    expect(result.current.drawings).toBe(updated);
  });
});
