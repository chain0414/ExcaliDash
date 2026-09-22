import { describe, expect, it } from "vitest";
import { assetCategory, byUsage, matchesAssetQuery, shuffledCategoryOrder } from "./assetCategories";
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

  it("keeps the requested seven categories first and shuffles only the rest", () => {
    const first = shuffledCategoryOrder(() => 0);
    const second = shuffledCategoryOrder(() => 0.999);
    const pinned = ["通用操作", "文件与知识", "数据与图表", "安全与设置", "沟通与社交", "科技与设备", "设计与创作"];
    expect(first.slice(0, 7)).toEqual(pinned);
    expect(second.slice(0, 7)).toEqual(pinned);
    expect(first.slice(7)).not.toEqual(second.slice(7));
    expect(new Set(first)).toEqual(new Set(second));
  });
});
