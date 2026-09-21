import express from "express";
import request from "supertest";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { registerTemplateRoutes } from "../routes/dashboard/templates";
import { internDrawingFiles } from "../fileProcessing";
import { createTestUser, getTestPrisma, initTestDb, setupTestDb } from "./testUtils";

describe("standalone templates", () => {
  const prisma = getTestPrisma();
  let ownerId: string;
  let otherId: string;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: req.headers["x-test-user"] === "other" ? otherId : ownerId,
      email: "test@example.com", name: "Test", role: "USER" };
    next();
  });
  registerTemplateRoutes(app, {
    prisma,
    requireAuth: (_req, _res, next) => next(),
    asyncHandler: (fn) => (req, res, next) => { Promise.resolve(fn(req, res, next)).catch(next); },
    parseJsonField: (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } },
    internDrawingFiles: (files, userId, drawingId) => internDrawingFiles(files, userId, drawingId, prisma),
    invalidateDrawingsCache: () => {},
  } as any);

  beforeAll(async () => {
    setupTestDb();
    ownerId = (await initTestDb(prisma)).id;
    otherId = (await createTestUser(prisma, "other@example.com")).id;
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    await prisma.template.deleteMany();
    await prisma.drawingFile.deleteMany();
    await prisma.drawing.deleteMany();
  });

  it("snapshots image bytes and creates an independent drawing after source deletion", async () => {
    const imageBytes = Buffer.from("test-png-bytes");
    const source = await prisma.drawing.create({ data: {
      userId: ownerId, name: "Original", elements: JSON.stringify([{ id: "image", type: "image", fileId: "file-1" }]),
      appState: "{}", files: JSON.stringify({ "file-1": { id: "file-1", mimeType: "image/png", dataURL: "/api/files/source/file-1" } }),
    } });
    await prisma.drawing.update({ where: { id: source.id }, data: {
      preview: '<svg><image href="/api/files/source/file-1"/></svg>',
    } });
    await prisma.drawingFile.create({ data: {
      drawingId: source.id, fileId: "file-1", mimeType: "image/png", sizeBytes: imageBytes.length,
      storage: "db", data: imageBytes,
    } });
    const saved = await request(app).post("/templates").send({ drawingId: source.id, name: "Reusable" });
    expect(saved.status).toBe(201);
    expect(saved.body.template.name).toBe("Reusable");
    expect(saved.body.template.preview).toContain("data:image/png;base64,");
    expect(saved.body.template.preview).not.toContain("/api/files/source/file-1");
    const templateId = saved.body.template.id;
    await prisma.drawingFile.deleteMany({ where: { drawingId: source.id } });
    await prisma.drawing.delete({ where: { id: source.id } });

    const created = await request(app).post(`/templates/${templateId}/create-drawing`).send({ name: "Remix" });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe("Remix");
    expect(created.body.files["file-1"].dataURL).toBe(`/api/files/${created.body.id}/file-1`);
    expect(created.body.preview).toContain(`/api/files/${created.body.id}/file-1`);
    const copiedFile = await prisma.drawingFile.findUnique({ where: {
      drawingId_fileId: { drawingId: created.body.id, fileId: "file-1" },
    } });
    expect(Buffer.from(copiedFile!.data!)).toEqual(imageBytes);
    expect(created.body.elements).toEqual([{ id: "image", type: "image", fileId: "file-1" }]);
  });

  it("keeps templates private and rejects missing image bytes", async () => {
    const source = await prisma.drawing.create({ data: {
      userId: ownerId, name: "Original", elements: "[]", appState: "{}",
      files: JSON.stringify({ "missing": { dataURL: "/api/files/missing" } }),
    } });
    expect((await request(app).post("/templates").send({ drawingId: source.id })).status).toBe(409);
    await prisma.drawing.update({ where: { id: source.id }, data: {
      elements: JSON.stringify([{ id: "image", type: "image", fileId: "missing" }]), files: "{}",
    } });
    expect((await request(app).post("/templates").send({ drawingId: source.id })).status).toBe(409);
    await prisma.drawing.update({ where: { id: source.id }, data: { elements: "[]" } });
    const saved = await request(app).post("/templates").send({ drawingId: source.id });
    expect(saved.status).toBe(201);
    const id = saved.body.template.id;
    const other = (path: string) => request(app).get(path).set("x-test-user", "other");
    expect((await other("/templates")).body.templates).toEqual([]);
    expect((await request(app).post(`/templates/${id}/create-drawing`).set("x-test-user", "other").send({})).status).toBe(404);
    expect((await request(app).delete(`/templates/${id}`).set("x-test-user", "other")).status).toBe(404);
    expect((await other(`/templates/${id}`)).status).toBe(404);
  });
});
