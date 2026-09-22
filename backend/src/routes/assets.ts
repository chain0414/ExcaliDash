import crypto from "crypto";
import express from "express";
import { z } from "zod";
import type { Prisma, PrismaClient } from "../generated/client";
import { sanitizeSvg } from "../security";

const labels = z.array(z.string().trim().min(1).max(80)).max(40).default([]);
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(80),
  sourceUrl: z.string().url().max(2048).optional().nullable(),
  license: z.string().trim().min(1).max(120),
  aliasesZh: labels,
  aliasesEn: labels,
  tags: labels,
  svg: z.string().min(1),
}).strict();

type AssetRow = {
  id: string; name: string; source: string; sourceUrl: string | null;
  license: string; aliasesZh: string; aliasesEn: string; tags: string;
  sha256: string; version: number; createdAt: Date; updatedAt: Date;
};

const parseLabels = (raw: string): string[] => {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const assetSummary = (asset: AssetRow) => ({
  id: asset.id,
  name: asset.name,
  source: asset.source,
  sourceUrl: asset.sourceUrl,
  license: asset.license,
  aliasesZh: parseLabels(asset.aliasesZh),
  aliasesEn: parseLabels(asset.aliasesEn),
  tags: parseLabels(asset.tags),
  keywords: [...parseLabels(asset.aliasesZh), ...parseLabels(asset.aliasesEn), ...parseLabels(asset.tags)],
  sha256: asset.sha256,
  version: asset.version,
  mimeType: "image/svg+xml" as const,
  previewUrl: `/api/assets/${asset.id}/svg`,
  createdAt: asset.createdAt,
  updatedAt: asset.updatedAt,
});

const FORBIDDEN_SVG = /<!|<\?|<\s*\/?\s*(?:script|foreignObject|iframe|object|embed|image|use|style|link|animate\w*|set)\b|\bon[a-z]+\s*=|\b(?:href|xlink:href)\s*=|url\s*\(|@import/iu;
const normalizeSvg = (raw: string): string | null => {
  if (Buffer.byteLength(raw, "utf8") > 128 * 1024) return null;
  const svg = raw.trim().replace(/currentColor/giu, "#1f2937");
  if (!/^<svg\b/iu.test(svg) || FORBIDDEN_SVG.test(svg)) return null;
  if (!/<svg\b[^>]*\bviewBox\s*=\s*["'][^"']+["']/iu.test(svg)) return null;
  const sanitized = sanitizeSvg(svg);
  if (!/^<svg\b/iu.test(sanitized) || !/<\/svg>\s*$/iu.test(sanitized)) return null;
  if (FORBIDDEN_SVG.test(sanitized)) return null;
  return sanitized;
};

type AssetInput = z.infer<typeof createSchema>;
const prepareAsset = (data: AssetInput) => {
  if (data.sourceUrl && !/^https:\/\//i.test(data.sourceUrl)) return null;
  const svg = normalizeSvg(data.svg);
  if (!svg) return null;
  return {
    name: data.name, source: data.source,
    sourceUrl: data.sourceUrl ?? null, license: data.license,
    aliasesZh: JSON.stringify(data.aliasesZh),
    aliasesEn: JSON.stringify(data.aliasesEn),
    tags: JSON.stringify(data.tags),
    searchText: [data.name, data.source, ...data.aliasesZh, ...data.aliasesEn, ...data.tags]
      .join(" ").toLowerCase(),
    svg,
    sha256: crypto.createHash("sha256").update(svg, "utf8").digest("hex"),
  };
};
type PreparedAsset = NonNullable<ReturnType<typeof prepareAsset>>;

const saveAsset = async (tx: Prisma.TransactionClient, userId: string, data: PreparedAsset) => {
  const unique = { userId_source_name: { userId, source: data.source, name: data.name } };
  const existing = await tx.asset.findUnique({ where: unique });
  if (existing && existing.sha256 === data.sha256 && existing.sourceUrl === data.sourceUrl &&
    existing.license === data.license && existing.aliasesZh === data.aliasesZh &&
    existing.aliasesEn === data.aliasesEn && existing.tags === data.tags) {
    return { asset: existing, action: "skipped" as const };
  }
  const asset = await tx.asset.upsert({
    where: unique,
    create: { userId, ...data },
    update: { ...data, version: { increment: 1 } },
  });
  return { asset, action: existing ? "updated" as const : "imported" as const };
};

export const registerAssetRoutes = (
  app: express.Express,
  deps: {
    prisma: PrismaClient;
    requireAuth: express.RequestHandler;
    asyncHandler: <T = void>(fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<T>) => express.RequestHandler;
  },
): void => {
  const { prisma, requireAuth, asyncHandler } = deps;

  app.get("/assets", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const rawQ = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const source = typeof req.query.source === "string" ? req.query.source.trim() : "";
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : "";
    const limit = req.query.limit === undefined ? 30 : Number(req.query.limit);
    if (rawQ.length > 200 || source.length > 80 || (cursor && !/^[0-9a-f-]{36}$/i.test(cursor)) ||
      !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ error: "Invalid asset query" });
    }
    const terms = rawQ.toLowerCase().split(/\s+/u).filter(Boolean).slice(0, 10);
    const assets = await prisma.asset.findMany({
      where: {
        userId: req.user.id,
        ...(source ? { source } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
        ...(terms.length ? { AND: terms.map((term) => ({ searchText: { contains: term } })) } : {}),
      },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const page = assets.slice(0, limit);
    return res.json({
      assets: page.map(assetSummary),
      nextCursor: assets.length > limit ? page[page.length - 1].id : null,
    });
  }));

  // Load metadata once so search and category changes are instant in the editor.
  app.get("/assets/catalog", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const [assets, usages] = await Promise.all([
      prisma.asset.findMany({
        where: { userId: req.user.id }, orderBy: { name: "asc" },
        select: { id: true, name: true, source: true, sourceUrl: true, license: true,
          aliasesZh: true, aliasesEn: true, tags: true, sha256: true, version: true,
          createdAt: true, updatedAt: true },
      }),
      prisma.assetUsage.findMany({ where: { userId: req.user.id },
        select: { assetId: true, count: true, lastUsedAt: true } }),
    ]);
    const usageByAsset = new Map(usages.map((usage) => [usage.assetId, usage]));
    return res.json({ assets: assets.map((asset) => ({
      ...assetSummary(asset),
      usageCount: usageByAsset.get(asset.id)?.count ?? 0,
      lastUsedAt: usageByAsset.get(asset.id)?.lastUsedAt ?? null,
    })) });
  }));

  app.post("/assets/:id/use", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid asset id" });
    const asset = await prisma.asset.findFirst({ where: { id: req.params.id, userId: req.user.id }, select: { id: true } });
    if (!asset) return res.status(404).json({ error: "Asset not found" });
    const usage = await prisma.assetUsage.upsert({
      where: { userId_assetId: { userId: req.user.id, assetId: asset.id } },
      create: { userId: req.user.id, assetId: asset.id, count: 1 },
      update: { count: { increment: 1 }, lastUsedAt: new Date() },
    });
    return res.json({ usageCount: usage.count, lastUsedAt: usage.lastUsedAt });
  }));

  app.get("/assets/:id", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const asset = await prisma.asset.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!asset) return res.status(404).json({ error: "Asset not found" });
    return res.json({ asset: {
      ...assetSummary(asset),
      dataURL: `data:image/svg+xml;base64,${Buffer.from(asset.svg, "utf8").toString("base64")}`,
    } });
  }));

  app.get("/assets/:id/svg", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const asset = await prisma.asset.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!asset) return res.status(404).json({ error: "Asset not found" });
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(asset.svg);
  }));

  app.post("/assets", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid asset payload" });
    const prepared = prepareAsset(parsed.data);
    if (!prepared) return res.status(400).json({ error: "Unsafe or unsupported asset" });
    const result = await prisma.$transaction((tx) => saveAsset(tx, req.user!.id, prepared));
    return res.status(result.action === "imported" ? 201 : 200).json({
      asset: assetSummary(result.asset), created: result.action === "imported",
    });
  }));

  app.post("/assets/import", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const parsed = z.object({ assets: z.array(createSchema).min(1).max(100) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid asset import payload" });
    const prepared = parsed.data.assets.map(prepareAsset);
    const invalidIndex = prepared.findIndex((asset) => asset === null);
    if (invalidIndex >= 0) {
      return res.status(400).json({ error: "Unsafe or unsupported asset", index: invalidIndex });
    }
    const result = await prisma.$transaction(async (tx) => {
      const counts = { imported: 0, updated: 0, skipped: 0, ids: [] as string[] };
      for (const data of prepared as PreparedAsset[]) {
        const saved = await saveAsset(tx, req.user!.id, data);
        counts[saved.action] += 1;
        counts.ids.push(saved.asset.id);
      }
      return counts;
    }, { maxWait: 10_000, timeout: 30_000 });
    return res.json(result);
  }));
};
