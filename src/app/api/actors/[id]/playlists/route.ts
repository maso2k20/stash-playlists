// app/api/actors/[id]/playlists/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SmartPlaylistConditions {
  actorIds?: string[];
  tagIds?: string[];
  minRating?: number | null;
}

// GET /api/actors/[id]/playlists - Get all playlists for a specific actor
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: actorId } = await context.params;

  if (!actorId) {
    return NextResponse.json({ error: 'Actor ID is required' }, { status: 400 });
  }

  try {
    // Fetch all playlists, ordered by name
    const allPlaylists = await prisma.playlist.findMany({
      include: { items: { orderBy: { itemOrder: 'asc' } } },
      orderBy: { name: 'asc' }
    });

    // Filter SMART playlists that include this actor
    const actorPlaylists = allPlaylists.filter((playlist) => {
      if (playlist.type !== 'SMART') {
        return false;
      }

      // Parse conditions JSON
      const conditions = playlist.conditions as SmartPlaylistConditions | null;
      if (!conditions || !conditions.actorIds) {
        return false;
      }

      // Check if the actor is in the actorIds array
      return conditions.actorIds.includes(actorId);
    });

    return NextResponse.json(actorPlaylists, { status: 200 });
  } catch (error) {
    console.error('Error fetching actor playlists:', error);
    return NextResponse.json({ error: 'Failed to fetch playlists for actor' }, { status: 500 });
  }
}
