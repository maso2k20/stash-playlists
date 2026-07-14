-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Actor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "image_path" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "markerCount" INTEGER NOT NULL DEFAULT 0,
    "unorganisedSceneCount" INTEGER NOT NULL DEFAULT 0,
    "markerCountUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Actor" ("createdAt", "id", "image_path", "markerCount", "markerCountUpdatedAt", "name", "rating", "updatedAt") SELECT "createdAt", "id", "image_path", "markerCount", "markerCountUpdatedAt", "name", "rating", "updatedAt" FROM "Actor";
DROP TABLE "Actor";
ALTER TABLE "new_Actor" RENAME TO "Actor";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
