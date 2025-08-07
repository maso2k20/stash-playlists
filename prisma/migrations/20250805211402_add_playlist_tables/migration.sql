-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'MANUAL',
    "conditions" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlaylistItem" (
    "playlistId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemOrder" INTEGER NOT NULL,
    "startTime" REAL NOT NULL DEFAULT 0,
    "endTime" REAL NOT NULL,
    "videoPath" TEXT NOT NULL,

    PRIMARY KEY ("playlistId", "itemId"),
    CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlaylistItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "videoPath" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "PlaylistItem_playlistId_itemOrder_idx" ON "PlaylistItem"("playlistId", "itemOrder");
