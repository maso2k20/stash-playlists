-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "startTime" REAL NOT NULL DEFAULT 0,
    "endTime" REAL NOT NULL DEFAULT 0,
    "screenshot" TEXT,
    "stream" TEXT,
    "preview" TEXT,
    "rating" INTEGER,
    "sceneId" TEXT,
    "orphaned" BOOLEAN NOT NULL DEFAULT false,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Item" ("createdAt", "endTime", "id", "orphaned", "preview", "rating", "sceneId", "screenshot", "startTime", "stream", "title", "updatedAt") SELECT "createdAt", "endTime", "id", "orphaned", "preview", "rating", "sceneId", "screenshot", "startTime", "stream", "title", "updatedAt" FROM "Item";
DROP TABLE "Item";
ALTER TABLE "new_Item" RENAME TO "Item";
CREATE INDEX "Item_sceneId_idx" ON "Item"("sceneId");
CREATE INDEX "Item_orphaned_idx" ON "Item"("orphaned");
CREATE INDEX "Item_playCount_idx" ON "Item"("playCount");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
