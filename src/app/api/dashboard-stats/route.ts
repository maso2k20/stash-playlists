// src/app/api/dashboard-stats/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Cheap aggregate counts for the dashboard stat tiles. All are simple COUNTs /
// a single GROUP BY, so this stays fast to load.
export async function GET() {
  const [playlists, actors, clips, ratingGroups] = await Promise.all([
    prisma.playlist.count(),
    prisma.actor.count(),
    prisma.item.count(),
    prisma.item.groupBy({
      by: ["rating"],
      where: { rating: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const byRating: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  for (const group of ratingGroups) {
    if (group.rating != null) byRating[group.rating] = group._count._all;
  }

  return NextResponse.json({
    playlists,
    actors,
    clips,
    ratings: { dislike: byRating[1], like: byRating[2], love: byRating[3] },
  });
}
