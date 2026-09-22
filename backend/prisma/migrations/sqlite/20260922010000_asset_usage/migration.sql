CREATE TABLE "AssetUsage" (
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId", "assetId"),
    CONSTRAINT "AssetUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssetUsage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AssetUsage_userId_count_idx" ON "AssetUsage"("userId", "count");
