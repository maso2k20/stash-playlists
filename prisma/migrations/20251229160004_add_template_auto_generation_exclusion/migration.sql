-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlaylistTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tagIds" JSONB NOT NULL,
    "requiredTagIds" JSONB,
    "optionalTagIds" JSONB,
    "excludeFromAutoGeneration" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_PlaylistTemplate" ("createdAt", "id", "name", "optionalTagIds", "requiredTagIds", "tagIds", "updatedAt") SELECT "createdAt", "id", "name", "optionalTagIds", "requiredTagIds", "tagIds", "updatedAt" FROM "PlaylistTemplate";
DROP TABLE "PlaylistTemplate";
ALTER TABLE "new_PlaylistTemplate" RENAME TO "PlaylistTemplate";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
