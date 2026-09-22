import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "../generated/client";
import { generateApiKey, serializeApiKeyScopes } from "../auth/apiKeys";
import { getTestPrisma, setupTestDb } from "../__tests__/testUtils";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1 L23 23" stroke="currentColor" fill-rule="evenodd" clip-rule="evenodd"/></svg>';

describe("owned SVG assets", () => {
  let prisma: PrismaClient;
  let app: any;
  let ownerToken: string;
  let readerToken: string;
  let otherToken: string;

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    ({ app } = await import("../index"));
    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { authEnabled: true },
      create: { id: "default", authEnabled: true },
    });
    const makeUserAndKey = async (email: string, scopes: string[]) => {
      const user = await prisma.user.create({
        data: { email, name: email, passwordHash: "test" },
      });
      const key = generateApiKey();
      await prisma.apiKey.create({ data: {
        userId: user.id, name: "test", keyId: key.keyId, tokenHash: key.tokenHash,
        prefix: key.prefix, scopes: serializeApiKeyScopes(scopes),
      } });
      return key.token;
    };
    ownerToken = await makeUserAndKey("asset-owner@test.local", ["assets:read", "assets:write"]);
    readerToken = await makeUserAndKey("asset-reader@test.local", ["assets:read"]);
    otherToken = await makeUserAndKey("asset-other@test.local", ["assets:read", "assets:write"]);
  });

  afterAll(async () => { await prisma?.$disconnect(); });

  it("sanitizes, indexes, paginates and isolates assets by owner", async () => {
    const create = () => request(app).post("/assets")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "map", source: "streamline-freehand", license: "CC BY 4.0",
        aliasesZh: ["地图", "位置"], aliasesEn: ["map"], tags: ["travel"], svg });
    const first = await create();
    expect(first.status).toBe(201);
    const id = first.body.asset.id;
    const repeat = await create();
    expect(repeat.status).toBe(200);
    expect(repeat.body.asset.id).toBe(id);
    expect(repeat.body.asset.version).toBe(1);
    const second = await request(app).post("/assets")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "compass", source: "streamline-freehand", license: "CC BY 4.0",
        aliasesZh: ["地图", "指南针"], svg: svg.replace("M1 1 L23 23", "M2 2 L22 22") });
    expect(second.status).toBe(201);
    const list = await request(app).get("/assets?q=地图&limit=1")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.assets).toHaveLength(1);
    expect(list.body.nextCursor).toBeTruthy();
    const next = await request(app).get(`/assets?q=地图&limit=1&cursor=${list.body.nextCursor}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(next.status).toBe(200);
    expect(next.body.assets).toHaveLength(1);
    expect(new Set([list.body.assets[0].id, next.body.assets[0].id])).toEqual(new Set([id, second.body.asset.id]));
    expect(next.body.nextCursor).toBeNull();
    const detail = await request(app).get(`/assets/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(detail.status).toBe(200);
    const decoded = Buffer.from(detail.body.asset.dataURL.split(",")[1], "base64").toString("utf8");
    expect(decoded).toContain('stroke="#1f2937"');
    expect(decoded).toContain('clip-rule="evenodd"');
    const preview = await request(app).get(`/assets/${id}/svg`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(preview.status).toBe(200);
    expect(preview.headers["content-type"]).toMatch(/image\/svg\+xml/);
    const batch = await request(app).get(`/assets/previews?ids=${id},${second.body.asset.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(batch.status).toBe(200);
    expect(batch.body.previews).toHaveLength(2);
    expect(Buffer.from(batch.body.previews[0].dataURL.split(",")[1], "base64").toString("utf8"))
      .toContain("<svg");
    expect((await request(app).get(`/assets/previews?ids=${id}`)
      .set("Authorization", `Bearer ${otherToken}`)).body.previews).toEqual([]);
    expect((await request(app).get(`/assets/previews?ids=${id},${id}`)
      .set("Authorization", `Bearer ${ownerToken}`)).status).toBe(400);
    expect((await request(app).get(`/assets/previews?ids=${id}`)).status).toBe(401);
    expect((await request(app).get(`/assets/${id}`).set("Authorization", `Bearer ${otherToken}`)).status).toBe(404);
    expect((await request(app).get("/assets?q=地图").set("Authorization", `Bearer ${otherToken}`)).body.assets).toEqual([]);
  });

  it("rejects active SVG content and requires assets:write", async () => {
    const payload = { name: "bad", source: "test", license: "test", svg: svg.replace("</svg>", '<script>alert(1)</script></svg>') };
    const bad = await request(app).post("/assets").set("Authorization", `Bearer ${ownerToken}`).send(payload);
    expect(bad.status).toBe(400);
    const noWrite = await request(app).post("/assets").set("Authorization", `Bearer ${readerToken}`).send({ ...payload, svg });
    expect(noWrite.status).toBe(403);
    const noRead = await request(app).get("/assets").set("Authorization", `Bearer ${readerToken}`);
    expect(noRead.status).toBe(200);
  });

  it("imports batches idempotently and rejects the entire batch when one SVG is unsafe", async () => {
    const assets = [
      { name: "batch-one", source: "test", license: "CC BY 4.0", aliasesZh: ["批量"], svg },
      { name: "batch-two", source: "test", license: "CC BY 4.0", aliasesZh: ["批量"],
        svg: svg.replace("M1 1 L23 23", "M4 4 L20 20") },
    ];
    const importBatch = (items: typeof assets) => request(app).post("/assets/import")
      .set("Authorization", `Bearer ${ownerToken}`).send({ assets: items });
    const first = await importBatch(assets);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ imported: 2, updated: 0, skipped: 0 });
    const repeat = await importBatch(assets);
    expect(repeat.body).toMatchObject({ imported: 0, updated: 0, skipped: 2 });
    expect(repeat.body.ids).toEqual(first.body.ids);
    const changed = await importBatch([{ ...assets[0], aliasesZh: ["批量", "一号"] }]);
    expect(changed.body).toMatchObject({ imported: 0, updated: 1, skipped: 0 });
    const detail = await request(app).get(`/assets/${first.body.ids[0]}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(detail.body.asset.version).toBe(2);
    const invalid = await importBatch([
      { ...assets[0], name: "should-not-exist" },
      { ...assets[1], svg: svg.replace("</svg>", "<script/></svg>") },
    ]);
    expect(invalid.status).toBe(400);
    expect(invalid.body.index).toBe(1);
    const absent = await request(app).get("/assets?q=should-not-exist")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(absent.body.assets).toEqual([]);
    const catalog = await request(app).get("/assets/catalog")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(catalog.status).toBe(200);
    expect(catalog.body.assets.find((item: { id: string }) => item.id === first.body.ids[0]).usageCount).toBe(0);
    const use = await request(app).post(`/assets/${first.body.ids[0]}/use`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(use.status).toBe(200);
    expect(use.body.usageCount).toBe(1);
    const again = await request(app).post(`/assets/${first.body.ids[0]}/use`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(again.body.usageCount).toBe(2);
    const recommended = await request(app).get("/assets/catalog")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(recommended.body.assets.find((item: { id: string }) => item.id === first.body.ids[0]).usageCount).toBe(2);
    expect((await request(app).post(`/assets/${first.body.ids[0]}/use`)
      .set("Authorization", `Bearer ${otherToken}`)).status).toBe(404);
    expect((await request(app).post(`/assets/${first.body.ids[0]}/use`)
      .set("Authorization", `Bearer ${readerToken}`)).status).toBe(403);
    const noWrite = await request(app).post("/assets/import")
      .set("Authorization", `Bearer ${readerToken}`).send({ assets });
    expect(noWrite.status).toBe(403);
  });
});
