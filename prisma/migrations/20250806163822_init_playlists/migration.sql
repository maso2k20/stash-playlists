/*
  Warnings:

  - The primary key for the `PlaylistItem` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `endTime` on the `PlaylistItem` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `PlaylistItem` table. All the data in the column will be lost.
  - You are about to drop the column `videoPath` on the `PlaylistItem` table. All the data in the column will be lost.
  - The required column `id` was added to the `PlaylistItem` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "startTime" REAL NOT NULL DEFAULT 0,
    "endTime" REAL NOT NULL DEFAULT 0,
    "videoPath" TEXT
);
INSERT INTO "new_Item" ("id", "title", "videoPath") SELECT "id", "title", "videoPath" FROM "Item";
DROP TABLE "Item";
ALTER TABLE "new_Item" RENAME TO "Item";
CREATE TABLE "new_PlaylistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playlistId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemOrder" INTEGER NOT NULL,
    CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlaylistItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PlaylistItem" ("itemId", "itemOrder", "playlistId") SELECT "itemId", "itemOrder", "playlistId" FROM "PlaylistItem";
DROP TABLE "PlaylistItem";
ALTER TABLE "new_PlaylistItem" RENAME TO "PlaylistItem";
CREATE INDEX "PlaylistItem_playlistId_itemOrder_idx" ON "PlaylistItem"("playlistId", "itemOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
