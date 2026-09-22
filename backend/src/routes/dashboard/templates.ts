import express from "express";
import { v4 as uuidv4 } from "uuid";
import { decodeDataURL, MIME_TO_EXT } from "../../fileProcessing";
import { deleteS3Object, downloadBuffer, drawingS3Prefix, isS3Enabled, listS3Objects } from "../../s3";
import { DrawingSanitizationError, sanitizeDrawingData, sanitizeSvg } from "../../security";
import type { DashboardRouteDeps } from "./types";

type SceneFile = { dataURL?: unknown; [key: string]: unknown };
type SceneFiles = Record<string, SceneFile>;

const parseName = (value: unknown, fallback: string): string | null => {
  if (value === undefined) return fallback.slice(0, 120);
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= 120 ? name : null;
};

const summary = (template: {
  id: string; name: string; preview: string | null;
  createdAt: Date; updatedAt: Date;
}) => ({
  id: template.id,
  name: template.name,
  preview: template.preview,
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
});

/** Replace a preview's drawing-scoped image URLs when taking/using a snapshot. */
const rewritePreview = (
  preview: string | null,
  before: SceneFiles,
  after: SceneFiles,
): string | null => {
  if (!preview) return null;
  let result = preview;
  for (const fileId of Object.keys(before)) {
    const oldUrl = before[fileId]?.dataURL;
    const newUrl = after[fileId]?.dataURL;
    if (typeof oldUrl !== "string" || typeof newUrl !== "string" || oldUrl === newUrl) continue;
    result = result.split(oldUrl).join(newUrl);
    result = result.split(oldUrl.replaceAll("&", "&amp;")).join(newUrl.replaceAll("&", "&amp;"));
  }
  return sanitizeSvg(result);
};

export const registerTemplateRoutes = (
  app: express.Express,
  deps: DashboardRouteDeps,
): void => {
  const { prisma, requireAuth, asyncHandler, parseJsonField, internDrawingFiles, invalidateDrawingsCache } = deps;

  app.get("/templates", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const templates = await prisma.template.findMany({
      where: { userId: req.user.id },
      select: { id: true, name: true, preview: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });
    return res.json({ templates: templates.map(summary) });
  }));

  app.get("/templates/:id", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const template = await prisma.template.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!template) return res.status(404).json({ error: "Template not found" });
    return res.json({ template: {
      ...summary(template),
      elements: parseJsonField(template.elements, []),
      appState: parseJsonField(template.appState, {}),
      files: parseJsonField(template.files, {}),
    } });
  }));

  app.put("/templates/:id", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const current = await prisma.template.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!current) return res.status(404).json({ error: "Template not found" });
    const name = parseName(req.body?.name, current.name);
    if (!name) return res.status(400).json({ error: "Invalid template name" });
    const expectedUpdatedAt = req.body?.expectedUpdatedAt;
    if (typeof expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
      return res.status(400).json({ error: "expectedUpdatedAt is required" });
    }
    if (!Array.isArray(req.body?.elements) || req.body.elements.length > 10000 ||
      !req.body?.appState || typeof req.body.appState !== "object" || Array.isArray(req.body.appState) ||
      !req.body?.files || typeof req.body.files !== "object" || Array.isArray(req.body.files) ||
      (req.body.preview !== null && typeof req.body.preview !== "string")) {
      return res.status(400).json({ error: "Invalid template scene" });
    }
    let scene: ReturnType<typeof sanitizeDrawingData>;
    try {
      scene = sanitizeDrawingData({
        elements: req.body.elements,
        appState: req.body.appState,
        files: req.body.files,
        preview: req.body.preview,
      });
    } catch (error) {
      if (error instanceof DrawingSanitizationError) {
        return res.status(error.statusCode).json({ error: "Invalid template scene" });
      }
      return res.status(400).json({ error: "Invalid template scene" });
    }
    const files = scene.files as SceneFiles;
    for (const element of scene.elements) {
      if (element.type !== "image" || element.isDeleted) continue;
      const fileId = element.fileId;
      if (typeof fileId !== "string" || !files[fileId]) {
        return res.status(400).json({ error: "Template image is missing file data" });
      }
    }
    for (const file of Object.values(files)) {
      if (!file || typeof file.dataURL !== "string" || !file.dataURL.startsWith("data:")) {
        return res.status(400).json({ error: "Template images must be embedded" });
      }
      const decoded = decodeDataURL(file.dataURL);
      if (!decoded || !(decoded.mimeType in MIME_TO_EXT)) {
        return res.status(400).json({ error: "Unsupported template image" });
      }
    }
    const updated = await prisma.template.updateMany({
      where: { id: current.id, userId: req.user.id, updatedAt: new Date(expectedUpdatedAt) },
      data: {
        name,
        elements: JSON.stringify(scene.elements),
        appState: JSON.stringify(scene.appState),
        files: JSON.stringify(files),
        preview: scene.preview ?? null,
      },
    });
    if (!updated.count) return res.status(409).json({ error: "Template was changed elsewhere; reload before saving" });
    const template = await prisma.template.findUniqueOrThrow({ where: { id: current.id } });
    return res.json({ template: summary(template) });
  }));

  app.post("/templates", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const drawingId = req.body?.drawingId;
    if (typeof drawingId !== "string" || !drawingId) {
      return res.status(400).json({ error: "drawingId is required" });
    }
    const source = await prisma.drawing.findFirst({ where: { id: drawingId, userId: req.user.id } });
    if (!source) return res.status(404).json({ error: "Drawing not found" });
    const name = parseName(req.body?.name, source.name);
    if (!name) return res.status(400).json({ error: "Invalid template name" });

    const sourceFiles = parseJsonField<SceneFiles>(source.files, {});
    const elements = parseJsonField<Array<{ type?: string; fileId?: string; isDeleted?: boolean }>>(source.elements, []);
    if (elements.some((element) => element.type === "image" && !element.isDeleted &&
      (typeof element.fileId !== "string" || !sourceFiles[element.fileId]))) {
      return res.status(409).json({ error: "Drawing has an image element without file data" });
    }
    const storedFiles = await prisma.drawingFile.findMany({ where: { drawingId } });
    const records = new Map(storedFiles.map((record) => [record.fileId, record]));
    const snapshotFiles: SceneFiles = {};
    for (const [fileId, file] of Object.entries(sourceFiles)) {
      if (!file || typeof file !== "object" || typeof file.dataURL !== "string") {
        return res.status(409).json({ error: "Drawing has an incomplete image file" });
      }
      let dataURL = file.dataURL;
      if (!dataURL.startsWith("data:")) {
        const record = records.get(fileId);
        if (!record || !(record.mimeType in MIME_TO_EXT)) {
          return res.status(409).json({ error: "Drawing image bytes are unavailable" });
        }
        const bytes = record.storage === "s3" && record.s3Key
          ? await downloadBuffer(record.s3Key)
          : record.storage === "db" && record.data
            ? Buffer.from(record.data)
            : null;
        if (!bytes) return res.status(409).json({ error: "Drawing image bytes are unavailable" });
        dataURL = `data:${record.mimeType};base64,${bytes.toString("base64")}`;
      }
      const decoded = decodeDataURL(dataURL);
      if (!decoded || !(decoded.mimeType in MIME_TO_EXT)) {
        return res.status(409).json({ error: "Drawing has an unsupported image file" });
      }
      snapshotFiles[fileId] = { ...file, dataURL };
    }

    const template = await prisma.template.create({ data: {
      name,
      userId: req.user.id,
      elements: source.elements,
      appState: source.appState,
      files: JSON.stringify(snapshotFiles),
      preview: rewritePreview(source.preview, sourceFiles, snapshotFiles),
    } });
    return res.status(201).json({ template: summary(template) });
  }));

  app.post("/templates/:id/create-drawing", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const template = await prisma.template.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!template) return res.status(404).json({ error: "Template not found" });
    const name = parseName(req.body?.name, template.name);
    if (!name) return res.status(400).json({ error: "Invalid drawing name" });

    const newDrawingId = uuidv4();
    const templateFiles = parseJsonField<SceneFiles>(template.files, {});
    let files: SceneFiles;
    let drawing;
    try {
      files = await internDrawingFiles(templateFiles, req.user.id, newDrawingId);
      drawing = await prisma.drawing.create({ data: {
        id: newDrawingId,
        name,
        userId: req.user.id,
        elements: template.elements,
        appState: template.appState,
        files: JSON.stringify(files),
        preview: rewritePreview(template.preview, templateFiles, files),
      } });
    } catch (error) {
      // Interning can write blobs before the drawing row is created.
      if (isS3Enabled()) {
        try {
          const objects = await listS3Objects(drawingS3Prefix(req.user.id, newDrawingId));
          await Promise.allSettled(objects.map((object) => deleteS3Object(object.key)));
        } catch (cleanupError) {
          console.warn("[templates] Failed to clean incomplete S3 drawing", cleanupError);
        }
      }
      await prisma.drawingFile.deleteMany({ where: { drawingId: newDrawingId } });
      throw error;
    }
    invalidateDrawingsCache();
    return res.status(201).json({
      ...drawing,
      elements: parseJsonField(drawing.elements, []),
      appState: parseJsonField(drawing.appState, {}),
      files: parseJsonField(drawing.files, {}),
    });
  }));

  app.delete("/templates/:id", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const removed = await prisma.template.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    if (!removed.count) return res.status(404).json({ error: "Template not found" });
    return res.json({ success: true });
  }));
};
