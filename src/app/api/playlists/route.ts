// app/api/playlists/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { normalizeConditions } from '@/lib/normalizeConditions';

const prisma = new PrismaClient();

// GET /api/playlists
//
// Returns the consolidated list both /playlists and /actors/[id]/playlists
// need to render: each playlist plus pre-computed itemCount/durationMs and
// resolved actor names for SMART conditions. This replaces the previous
// N+1 fan-out (one list call + one /stats per playlist + one /[id] per
// SMART playlist).
//
// Single-id lookup (?id=...) still returns the bulky include with items
// for the few callers that need it.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    // Single-playlist lookup keeps the legacy shape (items + nested item)
    // since some consumers (e.g. /playlists/[id] viewer page) depend on it.
    try {
      const playlist = await prisma.playlist.findUnique({
        where: { id },
        include: {
          items: {
            orderBy: { itemOrder: 'asc' },
            include: { item: true },
          },
        },
      });
      if (!playlist) {
        return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
      }
      return NextResponse.json(playlist, { status: 200 });
    } catch (error) {
      console.error(error);
      return NextResponse.json({ error: 'Failed to fetch playlist' }, { status: 500 });
    }
  }

  try {
    // 1) Fetch all playlists without the heavy items include.
    const playlists = await prisma.playlist.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        image: true,
        conditions: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 2) Fetch stats for all playlists in a single query.
    //    For 50 playlists × ~30 items × 2 floats this is trivial and keeps
    //    us in Prisma's typed API (no portability concerns vs $queryRaw).
    const links = await prisma.playlistItem.findMany({
      select: {
        playlistId: true,
        item: { select: { startTime: true, endTime: true } },
      },
    });
    const statsByPlaylist = new Map<string, { itemCount: number; durationMs: number }>();
    for (const link of links) {
      const current = statsByPlaylist.get(link.playlistId) ?? { itemCount: 0, durationMs: 0 };
      current.itemCount += 1;
      const dur = (link.item?.endTime ?? 0) - (link.item?.startTime ?? 0);
      if (dur > 0) current.durationMs += dur * 1000;
      statsByPlaylist.set(link.playlistId, current);
    }

    // 3) Parse conditions once per playlist and collect unique actor IDs.
    const parsed = playlists.map((p) => ({
      playlist: p,
      conditions: normalizeConditions(p.conditions),
    }));

    const allActorIds = new Set<string>();
    for (const { conditions } of parsed) {
      for (const aid of conditions.actorIds) allActorIds.add(aid);
    }

    // 4) Bulk resolve actor names in a single query.
    const actors = allActorIds.size
      ? await prisma.actor.findMany({
          where: { id: { in: [...allActorIds] } },
          select: { id: true, name: true },
        })
      : [];
    const actorById = new Map(actors.map((a) => [String(a.id), a]));

    // 5) Assemble the consolidated response.
    const response = parsed.map(({ playlist, conditions }) => {
      const stats = statsByPlaylist.get(playlist.id) ?? { itemCount: 0, durationMs: 0 };
      const resolvedActors = conditions.actorIds
        .map((id) => actorById.get(String(id)))
        .filter((a): a is { id: string; name: string } => Boolean(a));
      return {
        ...playlist,
        itemCount: stats.itemCount,
        durationMs: stats.durationMs,
        conditions,
        conditionsResolved: {
          actors: resolvedActors,
          tagIds: conditions.tagIds,
          requiredTagIds: conditions.requiredTagIds,
          optionalTagIds: conditions.optionalTagIds,
          minRating: conditions.minRating,
          exactRating: conditions.exactRating,
        },
      };
    });

    return NextResponse.json(response, {
      status: 200,
      headers: {
        // Browser can serve cached for 10s, use stale up to 60s while revalidating.
        // SWR layers stale-while-revalidate on top across page navigations.
        'Cache-Control': 'private, max-age=10, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch playlists' }, { status: 500 });
  }
}

// POST /api/playlists
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { name, description, type, conditions, image } = data;

    const playlist = await prisma.playlist.create({
      data: { name, description, type, conditions, image }
    });

    return NextResponse.json(playlist, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create playlist' }, { status: 500 });
  }
}

// PATCH /api/playlists/:id
export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
  }

  try {
    const data = await request.json();
    const updated = await prisma.playlist.update({
      where: { id },
      data
    });
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update playlist' }, { status: 500 });
  }
}

// DELETE /api/playlists/:id
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
  }

  try {
    // Get playlist to check for image
    const playlist = await prisma.playlist.findUnique({
      where: { id },
      select: { image: true }
    });

    // Delete image file if it exists
    if (playlist?.image) {
      try {
        const { unlink } = await import('fs/promises');
        const path = await import('path');
        const IMAGES_DIR = process.env.NODE_ENV === 'production' 
          ? '/data/playlist-images' 
          : path.join(process.cwd(), 'data', 'playlist-images');
        const filepath = path.join(IMAGES_DIR, playlist.image);
        await unlink(filepath);
      } catch (error) {
        console.warn('Failed to delete playlist image:', error);
      }
    }

    // Delete all PlaylistItems for this playlist first
    await prisma.playlistItem.deleteMany({ where: { playlistId: id } });

    // Now delete the playlist
    await prisma.playlist.delete({ where: { id } });

    return NextResponse.json({ message: 'Playlist deleted' }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete playlist' }, { status: 500 });
  }
}