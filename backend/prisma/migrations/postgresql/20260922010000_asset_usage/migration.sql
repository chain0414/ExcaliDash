CREATE TABLE "AssetUsage" (
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetUsage_pkey" PRIMARY KEY ("userId", "assetId")
);
CREATE INDEX "AssetUsage_userId_count_idx" ON "AssetUsage"("userId", "count");
ALTER TABLE "AssetUsage" ADD CONSTRAINT "AssetUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetUsage" ADD CONSTRAINT "AssetUsage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
