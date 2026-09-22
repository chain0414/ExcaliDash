CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "license" TEXT NOT NULL,
    "aliasesZh" TEXT NOT NULL DEFAULT '[]',
    "aliasesEn" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "searchText" TEXT NOT NULL,
    "svg" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Asset_userId_source_name_key" ON "Asset"("userId", "source", "name");
CREATE INDEX "Asset_userId_sha256_idx" ON "Asset"("userId", "sha256");
CREATE INDEX "Asset_userId_name_idx" ON "Asset"("userId", "name");
CREATE INDEX "Asset_userId_createdAt_idx" ON "Asset"("userId", "createdAt");
