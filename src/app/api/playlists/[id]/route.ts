import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const parts = pathname.split("/").filter(Boolean); // ["api","playlists",":id"]
    const playlistId = parts[2];
    if (!playlistId) {
      return NextResponse.json({ error: "Playlist ID is required" }, { status: 400 });
    }

    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        conditions: true,
      },
    });
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    const rawConds: any =
      typeof playlist.conditions === "string"
        ? safeParse(playlist.conditions)
        : playlist.conditions ?? {};

    const actorIds: string[] = Array.isArray(rawConds?.actorIds) ? rawConds.actorIds.map(String) : [];
    const tagIds: string[] = Array.isArray(rawConds?.tagIds) ? rawConds.tagIds.map(String) : [];

    // Resolve actors from Prisma; tags will be resolved client-side via StashTagsContext
    const actors = actorIds.length
      ? await prisma.actor.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];

    return NextResponse.json(
      {
        ...playlist,
        conditions: { actorIds, tagIds }, // keep normalized
        conditionsResolved: {
          actors,     // [{ id, name }]
          tagIds,     // pass through for client-side name lookup
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[GET /api/playlists/:id] error:", err);
    return NextResponse.json({ error: "Failed to fetch playlist" }, { status: 500 });
  }
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  // Extract playlist ID from the URL
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) {
    return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
  }

  // Parse request body
  const { name, description } = await request.json();

  // Update the playlist
  const updated = await prisma.playlist.update({
    where: { id: playlistId },
    data: {
      name,
      description,
    },
  });

  return NextResponse.json(updated, { status: 200 });
}

export async function PUT(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) {
    return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
  }

  const { name, description, conditions } = await request.json();

  const updated = await prisma.playlist.update({
    where: { id: playlistId },
    data: { name, description, conditions },
  });

  return NextResponse.json(updated, { status: 200 });
}

