import { api } from "./client";

export type DrawingAsset = {
  id: string;
  name: string;
  source: string;
  sourceUrl?: string;
  license?: string;
  aliasesZh?: string[];
  aliasesEn?: string[];
  tags?: string[];
  previewUrl?: string;
  usageCount?: number;
  lastUsedAt?: string | null;
};

export type DrawingAssetDetail = DrawingAsset & {
  mimeType: "image/svg+xml";
  dataURL: string;
};

export const searchDrawingAssets = async (q: string, cursor?: string) => {
  const response = await api.get<{
    assets: DrawingAsset[];
    nextCursor?: string | null;
  }>("/assets", { params: { q, limit: 48, ...(cursor ? { cursor } : {}) } });
  return response.data;
};

export const getDrawingAsset = async (id: string) => {
  const response = await api.get<{ asset: DrawingAssetDetail }>(
    `/assets/${encodeURIComponent(id)}`,
  );
  return response.data.asset;
};

export const getDrawingAssetCatalog = async (signal?: AbortSignal) => {
  const response = await api.get<{ assets: DrawingAsset[] }>("/assets/catalog", { signal });
  return response.data.assets;
};

export const recordDrawingAssetUse = async (id: string) => {
  const response = await api.post<{ usageCount: number; lastUsedAt: string }>(
    `/assets/${encodeURIComponent(id)}/use`,
  );
  return response.data;
};
