// app/api/playlists/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/playlists
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    // Fetch a single playlist with items and related Item data
    try {
      const playlist = await prisma.playlist.findUnique({
        where: { id },
        include: {
          items: {
            orderBy: { itemOrder: 'asc' },
            include: { item: true }, // include the related Item data
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

  // Otherwise, return all playlists (as before)
  try {
    const playlists = await prisma.playlist.findMany({
      include: { items: { orderBy: { itemOrder: 'asc' } } }
    });
    return NextResponse.json(playlists, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch playlists' }, { status: 500 });
  }
}

// POST /api/playlists
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { name, description, type, conditions } = data;

    const playlist = await prisma.playlist.create({
      data: { name, description, type, conditions }
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