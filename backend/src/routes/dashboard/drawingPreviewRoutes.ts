import express from "express";
import { canViewDrawing, getDrawingAccess } from "../../authz/sharing";
import type { DrawingRouteContext } from "./drawingRouteContext";

export const registerDrawingPreviewRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const {
    prisma,
    optionalAuth,
    asyncHandler,
    getRequestPrincipal,
    respondWithAuthErrorIfPresent,
  } = context;

  // Per-drawing preview: small, ETag-cacheable, revalidates against updatedAt.
  // Registered before `/drawings/:id` so previews aren't treated as an id.
  app.get(
    "/drawings/:id/preview",
    optionalAuth,
    asyncHandler(async (req, res) => {
      const principal = await getRequestPrincipal(req);
      const { id } = req.params;

      const access = await getDrawingAccess({ prisma, principal, drawingId: id });
      if (!canViewDrawing(access)) {
        if (respondWithAuthErrorIfPresent(req, res)) return;
        return res.status(404).json({
          error: "Drawing not found",
          message: "Drawing does not exist",
        });
      }

      // Revalidation only needs the version marker. Avoid loading the SVG on
      // a cache hit; unconditional requests still use just one content query.
      if (req.headers["if-none-match"]) {
        const metadata = await prisma.drawing.findUnique({
          where: { id },
          select: { updatedAt: true },
        });
        if (!metadata) {
          return res.status(404).json({
            error: "Drawing not found",
            message: "Drawing does not exist",
          });
        }
        const etag = `W/"preview-${id}-${new Date(metadata.updatedAt).getTime()}"`;
        if (req.headers["if-none-match"] === etag) {
          res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
          res.setHeader("ETag", etag);
          return res.status(304).end();
        }
      }

      const drawing = await prisma.drawing.findUnique({
        where: { id },
        select: { preview: true, updatedAt: true },
      });
      if (!drawing) {
        return res.status(404).json({
          error: "Drawing not found",
          message: "Drawing does not exist",
        });
      }

      // Fetch preview and updatedAt together so an intervening save cannot
      // tag new content with the marker from the earlier metadata query.
      const updatedAtMs = new Date(drawing.updatedAt).getTime();
      const etag = `W/"preview-${id}-${updatedAtMs}"`;
      res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }

      return res.json({ preview: drawing.preview ?? null, updatedAt: updatedAtMs });
    }),
  );

};
