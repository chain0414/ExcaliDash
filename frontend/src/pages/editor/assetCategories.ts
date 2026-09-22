import type { DrawingAsset } from "../../api/assets";

export const CATEGORY_LABELS = [
  "设计与创作", "工作与商务", "科技与设备", "数据与图表", "沟通与社交",
  "金融与购物", "旅行与生活", "媒体与娱乐", "人物与健康", "文件与知识",
  "安全与设置", "通用操作",
] as const;
export type AssetCategory = typeof CATEGORY_LABELS[number];

const PREFIXES: Record<AssetCategory, string> = {
  "设计与创作": "design creativity edit graphic vectors composition color crop retouch photo picture image camera lens layers layouts shape drawing taking",
  "工作与商务": "business work worker workflow office job task project products product strategy meeting collaboration organization crm customer performance optimization monetization advertising presentation seo desk",
  "科技与设备": "android app apps arduino bluetooth cables cell cellular charging cloud computer desktop digital hard keyboard laptop memory microprocessor mobile mobilephone modern module mouse network programming code coding server sim smart smartphone tablet terminal vibrate website webcam wifi wireless screen qr",
  "数据与图表": "analytics data database dashboard graph stats hierarchy grid filter search",
  "沟通与社交": "answer connect conversation email envelope fax mailbox messages phone send share social voice",
  "金融与购物": "accounting barcode calculator card cash coupon credit crypto currency discount donation e money payment receipt saving shop shopping trading transfer wealth",
  "旅行与生活": "airplane amusement cleaning escalator family garbage gps home laundry lift locker navigation seat stairs swimming toilet walking water",
  "媒体与娱乐": "board casino cd circus concert earpods equalizer fireworks headphones instrument ipod kindle media microphone movies multimedia music night party playlist podcast radio smiley speaker tape vide video vintage vinyl volume walkman",
  "人物与健康": "begging disability emoji face famous gesture human iris mask role touch",
  "文件与知识": "archive book bookmarks content document file floppy folder form learning lists newspaper notes paragraphs print read stamps text",
  "安全与设置": "alert alerts allowances broken bug lock login password power safety security settings signal warning",
  "通用操作": "accessories add calendar check controls copy cursor delete download drawer expand flip focus help information light link loading menu move moving paginate pathfinder plugin push remove reorder resize responsive retract rotate ruler scanner scroll select show synchronize tag tags time timer transform ui unlink unlock upload view waiting worldwide zoom",
};

const BY_PREFIX = new Map<string, AssetCategory>();
for (const label of CATEGORY_LABELS) {
  for (const prefix of PREFIXES[label].split(" ")) BY_PREFIX.set(prefix, label);
}

export const assetCategory = (asset: DrawingAsset): AssetCategory =>
  BY_PREFIX.get(asset.name.split("-")[0].toLowerCase()) ?? "通用操作";

export const assetSearchText = (asset: DrawingAsset) =>
  [asset.name, asset.source, ...(asset.aliasesZh ?? []), ...(asset.aliasesEn ?? []), ...(asset.tags ?? [])]
    .join(" ").toLowerCase();

export const matchesAssetQuery = (asset: DrawingAsset, query: string) =>
  query.toLowerCase().trim().split(/\s+/u).filter(Boolean).every((term) => assetSearchText(asset).includes(term));

export const byUsage = (a: DrawingAsset, b: DrawingAsset) =>
  (b.usageCount ?? 0) - (a.usageCount ?? 0) ||
  (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "") ||
  a.name.localeCompare(b.name);
