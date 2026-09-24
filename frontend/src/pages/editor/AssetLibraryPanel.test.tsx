import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AssetLibraryPanel } from "./AssetLibraryPanel";

const mocked = vi.hoisted(() => ({ catalog: vi.fn(), previews: vi.fn(), detail: vi.fn(), use: vi.fn(), insert: vi.fn() }));
vi.mock("../../api", () => ({
  API_URL: "/api", getDrawingAssetCatalog: mocked.catalog,
  getDrawingAssetPreviews: mocked.previews,
  getDrawingAsset: mocked.detail, recordDrawingAssetUse: mocked.use,
}));
vi.mock("./insertDrawingAsset", () => ({ insertDrawingAsset: mocked.insert }));

describe("AssetLibraryPanel", () => {
  beforeEach(() => vi.clearAllMocks());
  it("shows the two imported libraries as the first two categories", async () => {
    mocked.catalog.mockResolvedValue([
      { id: "ai", version: 1, name: "dashboard-grid", source: "wayne-ai-data", usageCount: 1 },
      { id: "user", version: 1, name: "user-check", source: "wayne-users-product", usageCount: 2 },
      { id: "old", version: 1, name: "database-hand", source: "streamline-freehand", usageCount: 3 },
    ]);
    mocked.previews.mockImplementation(async (ids: string[]) => ids.map((id) =>
      ({ id, version: 1, dataURL: "data:image/svg+xml;base64,PHN2Zy8+" })));
    render(<AssetLibraryPanel isOpen canEdit excalidrawAPIRef={{ current: {} }} onClose={vi.fn()} />);
    const labels = () => within(screen.getByLabelText("图标分类")).getAllByRole("button")
      .map((button) => button.textContent?.replace(/\s+\d+$/, ""));
    await screen.findAllByRole("button", { name: "插入 dashboard-grid" });
    expect(labels().slice(1, 3)).toEqual(["AI 与数据", "用户与产品"]);
    fireEvent.click(screen.getByRole("tab", { name: "推荐" }));
    expect(labels().slice(1, 3)).toEqual(["AI 与数据", "用户与产品"]);
  });
  it("shows imported brand icons in their own category", async () => {
    mocked.catalog.mockResolvedValue([
      { id: "brand", version: 1, name: "brand-amap", source: "arcticons", aliasesZh: ["高德地图"], usageCount: 0 },
      { id: "normal", version: 1, name: "calendar", source: "streamline-freehand", usageCount: 0 },
    ]);
    mocked.previews.mockImplementation(async (ids: string[]) => ids.map((id) =>
      ({ id, version: 1, dataURL: "data:image/svg+xml;base64,PHN2Zy8+" })));
    render(<AssetLibraryPanel isOpen canEdit excalidrawAPIRef={{ current: {} }} onClose={vi.fn()} />);
    const categoryBar = within(await screen.findByLabelText("图标分类"));
    const brandCategory = await categoryBar.findByRole("button", { name: "品牌图标 1" });
    fireEvent.click(brandCategory);
    expect(screen.getByRole("button", { name: "插入 brand-amap" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "插入 calendar" })).toBeNull();
  });
  it("filters locally, shows a zero-result state, and exposes categories and recommendations", async () => {
    mocked.previews.mockImplementation(async (ids: string[]) => ids.map((id) =>
      ({ id, version: 1, dataURL: "data:image/svg+xml;base64,PHN2Zy8+" })));
    mocked.catalog.mockResolvedValue([
      { id: "1", version: 1, name: "business-deal-handshake", source: "streamline-freehand", aliasesZh: ["商务"], usageCount: 2 },
      { id: "2", version: 1, name: "database-hand", source: "streamline-freehand", aliasesZh: ["数据库"], usageCount: 0 },
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

  it("batches visible previews and reuses them after reopening the panel", async () => {
    mocked.catalog.mockResolvedValue(Array.from({ length: 120 }, (_, i) => ({
      id: String(i + 1), version: 1, name: `business-icon-${i}`, source: "test", usageCount: 0,
    })));
    mocked.previews.mockImplementation(async (ids: string[]) => ids.map((id) =>
      ({ id, version: 1, dataURL: "data:image/svg+xml;base64,PHN2Zy8+" })));
    const props = { canEdit: true, excalidrawAPIRef: { current: {} }, onClose: vi.fn() };
    const view = render(<AssetLibraryPanel {...props} isOpen />);
    fireEvent.click(await screen.findByRole("button", { name: /工作与商务 120/ }));
    await waitFor(() => expect(mocked.previews).toHaveBeenCalled());
    await waitFor(() => expect(view.container.querySelectorAll("img").length).toBe(60));
    const firstCount = mocked.previews.mock.calls.length;
    expect(new Set(mocked.previews.mock.calls.flatMap(([ids]) => ids)).size).toBe(60);
    fireEvent.click(screen.getByRole("button", { name: "显示更多" }));
    await waitFor(() => expect(view.container.querySelectorAll("img").length).toBe(120));
    expect(mocked.previews).toHaveBeenCalledTimes(firstCount + 1);
    expect(mocked.previews.mock.calls[firstCount][0]).toHaveLength(60);
    view.rerender(<AssetLibraryPanel {...props} isOpen={false} />);
    view.rerender(<AssetLibraryPanel {...props} isOpen />);
    await waitFor(() => expect(view.container.querySelectorAll("img").length).toBe(120));
    expect(mocked.previews).toHaveBeenCalledTimes(firstCount + 1);
  });
});
