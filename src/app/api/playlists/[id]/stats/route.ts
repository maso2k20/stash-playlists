// app/api/playlists/[id]/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    // /api/playlists/:id/stats
    const { pathname } = request.nextUrl;
    const parts = pathname.split("/").filter(Boolean); // ["api","playlists",":id","stats"]
    const playlistId = parts[2];
    if (!playlistId) {
      return NextResponse.json({ error: "Playlist ID is required in the URL" }, { status: 400 });
    }

    // Ensure playlist exists
    const exists = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    // Pull only the needed fields from related items
    const rows = await prisma.playlistItem.findMany({
      where: { playlistId },
      select: { item: { select: { startTime: true, endTime: true } } },
    });

    const itemCount = rows.length;

    // Sum (endTime - startTime) for items that have both numbers
    let total = 0;
    for (const r of rows) {
      const st = typeof r.item?.startTime === "number" ? r.item.startTime : null;
      const et = typeof r.item?.endTime === "number" ? r.item.endTime : null;
      if (st != null && et != null && et > st) total += (et - st);
    }

    // If your times are in SECONDS, keep *1000; if already ms, remove it.
    const durationMs = Math.max(0, Math.round(total * 1000));

    return NextResponse.json(
      { itemCount, durationMs },
      { status: 200, headers: { "Cache-Control": "private, max-age=5" } }
    );
  } catch (err) {
    console.error("[GET /playlists/:id/stats] Error:", err);
    return NextResponse.json({ error: "Failed to compute playlist stats" }, { status: 500 });
  }
}
