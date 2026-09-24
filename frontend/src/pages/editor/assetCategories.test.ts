import { describe, expect, it } from "vitest";
import { assetCategory, byUsage, matchesAssetQuery, shuffledCategoryOrder, sortRecommendedCategories, type AssetCategory } from "./assetCategories";
import type { DrawingAsset } from "../../api/assets";

const icon = (name: string, aliasesZh: string[] = [], usageCount = 0): DrawingAsset =>
  ({ id: name, name, source: "streamline-freehand", aliasesZh, usageCount });

describe("asset catalog filtering", () => {
  it("groups icons, matches Chinese and English, and returns zero results immediately", () => {
    const map = icon("travel-map", ["地图", "位置"]);
    expect(matchesAssetQuery(map, "地图")).toBe(true);
    expect(matchesAssetQuery(map, "TRAVEL map")).toBe(true);
    expect(matchesAssetQuery(map, "不存在的图标")).toBe(false);
    expect(assetCategory(icon("database-hand"))).toBe("数据与图表");
    expect(assetCategory(icon("business-deal-handshake"))).toBe("工作与商务");
  });

  it("puts frequently used icons first", () => {
    expect([icon("a", [], 1), icon("b", [], 3)].sort(byUsage).map((item) => item.name))
      .toEqual(["b", "a"]);
  });

  it("pins the brand category with the existing top categories and shuffles only the rest", () => {
    const first = shuffledCategoryOrder(() => 0);
    const second = shuffledCategoryOrder(() => 0.999);
    const pinned = ["AI 与数据", "用户与产品", "品牌图标", "通用操作", "文件与知识", "数据与图表", "安全与设置", "沟通与社交", "科技与设备", "设计与创作"];
    expect(first.slice(0, 10)).toEqual(pinned);
    expect(second.slice(0, 10)).toEqual(pinned);
    expect(first.slice(10)).not.toEqual(second.slice(10));
    expect(new Set(first)).toEqual(new Set(second));
  });

  it("uses the library source for the two new categories, without changing old icons", () => {
    expect(assetCategory({ ...icon("dashboard-grid"), source: "wayne-ai-data" })).toBe("AI 与数据");
    expect(assetCategory({ ...icon("user-check"), source: "wayne-users-product" })).toBe("用户与产品");
    expect(assetCategory(icon("dashboard-grid"))).toBe("数据与图表");
  });

  it("groups imported brands by their name across different licensed sources", () => {
    for (const source of ["simple-icons", "arcticons", "wikimedia-commons"]) {
      expect(assetCategory({ ...icon("brand-amap"), source })).toBe("品牌图标");
    }
    expect(assetCategory({ ...icon("youtube"), source: "simple-icons" })).toBe("通用操作");
  });

  it("pins the new categories in recommendations regardless of usage count", () => {
    const usages = new Map<AssetCategory, number>([["AI 与数据", 1], ["用户与产品", 2], ["工作与商务", 10]]);
    expect(sortRecommendedCategories(usages).slice(0, 3))
      .toEqual(["AI 与数据", "用户与产品", "工作与商务"]);
  });
});
