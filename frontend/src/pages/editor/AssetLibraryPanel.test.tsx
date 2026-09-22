import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AssetLibraryPanel } from "./AssetLibraryPanel";

const mocked = vi.hoisted(() => ({ catalog: vi.fn(), detail: vi.fn(), use: vi.fn(), insert: vi.fn() }));
vi.mock("../../api", () => ({
  API_URL: "/api", getDrawingAssetCatalog: mocked.catalog,
  getDrawingAsset: mocked.detail, recordDrawingAssetUse: mocked.use,
}));
vi.mock("./insertDrawingAsset", () => ({ insertDrawingAsset: mocked.insert }));

describe("AssetLibraryPanel", () => {
  it("filters locally, shows a zero-result state, and exposes categories and recommendations", async () => {
    mocked.catalog.mockResolvedValue([
      { id: "1", name: "business-deal-handshake", source: "streamline-freehand", aliasesZh: ["商务"], usageCount: 2 },
      { id: "2", name: "database-hand", source: "streamline-freehand", aliasesZh: ["数据库"], usageCount: 0 },
    ]);
    render(<AssetLibraryPanel isOpen canEdit excalidrawAPIRef={{ current: {} }} onClose={vi.fn()} />);
    await screen.findAllByRole("button", { name: "插入 business-deal-handshake" });
    expect(within(screen.getByLabelText("图标分类")).getByRole("button", { name: /工作与商务/ })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "搜索手绘图标" }), { target: { value: "完全不存在" } });
    expect(screen.getByText("没有找到匹配的图标。")).toBeTruthy();
    expect(screen.queryByText("正在加载图标…")).toBeNull();
    expect(mocked.catalog).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole("textbox", { name: "搜索手绘图标" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("tab", { name: "推荐" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "插入 business-deal-handshake" }).length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "插入 database-hand" })).toBeNull();
  });
});
