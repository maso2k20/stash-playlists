-- CreateTable
CREATE TABLE "RefreshLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refreshType" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "refreshedPlaylists" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "duration" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "RefreshLog_createdAt_idx" ON "RefreshLog"("createdAt");
