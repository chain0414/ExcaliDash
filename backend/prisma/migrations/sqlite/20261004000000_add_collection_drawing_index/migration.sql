-- Collection views include drawings by any creator, so user-prefixed indexes
-- cannot satisfy their collection-only filter and default updatedAt ordering.
CREATE INDEX "Drawing_collectionId_updatedAt_idx"
ON "Drawing" ("collectionId", "updatedAt");
