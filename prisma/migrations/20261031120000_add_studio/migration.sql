-- CreateTable
CREATE TABLE "Studio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "image_path" TEXT,
    "parentName" TEXT,
    "markerCount" INTEGER NOT NULL DEFAULT 0,
    "unorganisedSceneCount" INTEGER NOT NULL DEFAULT 0,
    "countsUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

