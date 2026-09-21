import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateApiKey, serializeApiKeyScopes } from "../auth/apiKeys";
import { createAuthMiddleware } from "../middleware/auth";
import { registerFileRoutes } from "./files";

const s3Mocks = vi.hoisted(() => ({
  isS3Enabled: vi.fn(),
  generatePresignedDownloadUrl: vi.fn(),
  uploadBuffer: vi.fn(),
  buildS3Key: vi.fn(),
}));

vi.mock("../s3", () => s3Mocks);

describe("file routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    s3Mocks.isS3Enabled.mockReturnValue(true);
    s3Mocks.generatePresignedDownloadUrl.mockResolvedValue(
      "https://signed.example/file",
    );
  });

  it("allows private S3 redirects for users with collection share access", async () => {
    const prisma = {
      drawing: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            userId: "owner-user",
          })
          .mockResolvedValueOnce({
            collectionId: "shared-collection",
            userId: "owner-user",
          }),
      },
      drawingPermission: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      collection: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      collectionShare: {
        findFirst: vi.fn().mockResolvedValue({ role: "view" }),
      },
      drawingLinkShare: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      drawingFile: {
        findUnique: vi.fn().mockResolvedValue({
          storage: "s3",
          s3Key: "excalidash/owner-user/drawing-1/file-1.png",
          mimeType: "image/png",
          data: null,
        }),
      },
    };
    const app = express();
    registerFileRoutes(app, {
      prisma: prisma as any,
      requireAuth: (_req, _res, next) => next(),
      optionalAuth: (req, _res, next) => {
        req.user = {
          id: "viewer-user",
          email: "viewer@test.local",
          name: "Viewer",
          role: "USER",
        };
        next();
      },
      asyncHandler: (fn) => (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
      },
    });

    const response = await request(app).get("/files/drawing-1/file-1");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("https://signed.example/file");
    expect(prisma.collectionShare.findFirst).toHaveBeenCalledWith({
      where: {
        collectionId: "shared-collection",
        granteeUserId: "viewer-user",
      },
      select: { role: true },
    });
  });

  it("uploads raw bytes to S3 and records a storage='s3' DrawingFile row", async () => {
    s3Mocks.isS3Enabled.mockReturnValue(true);
    s3Mocks.buildS3Key.mockReturnValue(
      "excalidash/owner-user/drawing-1/file-1.png",
    );
    s3Mocks.uploadBuffer.mockResolvedValue(undefined);

    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      drawing: {
        findUnique: vi.fn().mockResolvedValue({ userId: "owner-user" }),
      },
      drawingFile: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert,
      },
    };
    const app = express();
    registerFileRoutes(app, {
      prisma: prisma as any,
      requireAuth: (req, _res, next) => {
        req.user = {
          id: "owner-user",
          email: "owner@test.local",
          name: "Owner",
          role: "USER",
        };
        next();
      },
      optionalAuth: (_req, _res, next) => next(),
      asyncHandler: (fn) => (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
      },
    });

    const response = await request(app)
      .put("/drawings/drawing-1/files/file-1")
      .set("Content-Type", "image/png")
      .send(Buffer.from([1, 2, 3, 4]));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      url: "/api/files/drawing-1/file-1",
      fileId: "file-1",
    });
    expect(s3Mocks.uploadBuffer).toHaveBeenCalledWith(
      "excalidash/owner-user/drawing-1/file-1.png",
      expect.any(Buffer),
      "image/png",
    );
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      drawingId: "drawing-1",
      fileId: "file-1",
      storage: "s3",
      s3Key: "excalidash/owner-user/drawing-1/file-1.png",
      data: null,
      mimeType: "image/png",
    });
  });

  it("rejects an unsupported Content-Type with 415", async () => {
    s3Mocks.isS3Enabled.mockReturnValue(false);
    const prisma = {
      drawing: {
        findUnique: vi.fn().mockResolvedValue({ userId: "owner-user" }),
      },
      drawingFile: { findUnique: vi.fn(), upsert: vi.fn() },
    };
    const app = express();
    registerFileRoutes(app, {
      prisma: prisma as any,
      requireAuth: (req, _res, next) => {
        req.user = {
          id: "owner-user",
          email: "owner@test.local",
          name: "Owner",
          role: "USER",
        };
        next();
      },
      optionalAuth: (_req, _res, next) => next(),
      asyncHandler: (fn) => (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
      },
    });

    const response = await request(app)
      .put("/drawings/drawing-1/files/file-1")
      .set("Content-Type", "application/pdf")
      .send(Buffer.from([1, 2, 3, 4]));

    expect(response.status).toBe(415);
    expect(prisma.drawingFile.upsert).not.toHaveBeenCalled();
  });
});

describe("API key file reads", () => {
  const fileBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  const setup = (scopes: string[]) => {
    const key = generateApiKey();
    const prisma = {
      apiKey: {
        findUnique: vi.fn().mockResolvedValue({
          id: "key-1",
          tokenHash: key.tokenHash,
          scopes: serializeApiKeyScopes(scopes),
          revokedAt: null,
          user: {
            id: "owner-user",
            username: "owner",
            email: "owner@test.local",
            name: "Owner",
            role: "USER",
            mustResetPassword: false,
            isActive: true,
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      drawing: {
        findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) =>
          where.id === "owned-drawing" ? { userId: "owner-user" } : { userId: "other-user" },
        ),
      },
      drawingPermission: { findUnique: vi.fn().mockResolvedValue(null) },
      collection: { findFirst: vi.fn().mockResolvedValue(null) },
      collectionShare: { findFirst: vi.fn().mockResolvedValue(null) },
      drawingLinkShare: { findFirst: vi.fn().mockResolvedValue(null) },
      drawingFile: {
        findUnique: vi.fn().mockResolvedValue({
          storage: "db",
          data: fileBytes,
          mimeType: "image/png",
        }),
      },
    };
    const authModeService = { getAuthEnabled: vi.fn().mockResolvedValue(true) };
    const { optionalAuth, requireAuth } = createAuthMiddleware({
      prisma: prisma as any,
      authModeService: authModeService as any,
    });
    const api = express();
    registerFileRoutes(api, {
      prisma: prisma as any,
      optionalAuth,
      requireAuth,
      asyncHandler: (fn) => (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
      },
    });
    const app = express();
    app.use("/api", api);
    return { app, key: key.token, prisma };
  };

  it("returns stored bytes to a drawings:read key for an accessible drawing", async () => {
    const { app, key, prisma } = setup(["drawings:read"]);
    const response = await request(app)
      .get("/api/files/owned-drawing/file-1")
      .set("Authorization", `Bearer ${key}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^image\/png/);
    expect(response.body).toEqual(fileBytes);
    expect(prisma.drawingFile.findUnique).toHaveBeenCalledWith({
      where: { drawingId_fileId: { drawingId: "owned-drawing", fileId: "file-1" } },
    });
  });

  it("does not expose a private drawing merely because the key has drawings:read", async () => {
    const { app, key, prisma } = setup(["drawings:read"]);
    const response = await request(app)
      .get("/api/files/other-drawing/file-1")
      .set("Authorization", `Bearer ${key}`);

    expect(response.status).toBe(404);
    expect(prisma.drawingFile.findUnique).not.toHaveBeenCalled();
  });

  it("does not serve private files to a key without drawings:read", async () => {
    const { app, key, prisma } = setup(["collections:read"]);
    const response = await request(app)
      .get("/api/files/owned-drawing/file-1")
      .set("Authorization", `Bearer ${key}`);

    expect(response.status).toBe(404);
    expect(prisma.drawingFile.findUnique).not.toHaveBeenCalled();
  });
});
