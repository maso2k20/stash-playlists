// app/api/playlists/[id]/items/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// POST /api/playlists/[id]/items
export async function POST(request: NextRequest) {
  // Extract playlistId from the URL
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) {
    return NextResponse.json({ error: 'Playlist ID is required in the URL' }, { status: 400 });
  }

  // Ensure playlist exists
  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) {
    return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
  }

  try {
    const { items }: { items: { id: string; title: string; startTime: number; endTime: number; screenshot?: string; stream?: string }[] } = await request.json();
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 });
    }

    let addedCount = 0;

    // Get the current max itemOrder for this playlist
    const lastItem = await prisma.playlistItem.findFirst({
      where: { playlistId },
      orderBy: { itemOrder: 'desc' },
    });
    let startOrder = lastItem ? lastItem.itemOrder + 1 : 0;

    for (const [index, item] of items.entries()) {
      // Upsert Item
      await prisma.item.upsert({
        where: { id: item.id },
        update: {
          title: item.title,
          startTime: item.startTime,
          endTime: item.endTime,
          screenshot: item.screenshot,
          stream: item.stream,
        },
        create: {
          id: item.id,
          title: item.title,
          startTime: item.startTime,
          endTime: item.endTime,
          screenshot: item.screenshot,
          stream: item.stream,
        },
      });

      // Upsert PlaylistItem (add if not exists)
      const exists = await prisma.playlistItem.findFirst({
        where: { playlistId, itemId: item.id },
      });
      if (!exists) {
        await prisma.playlistItem.create({
          data: {
            playlistId,
            itemId: item.id,
            itemOrder: startOrder,
          },
        });
        startOrder++; // increment for next item
        addedCount++;
      }
    }

    return NextResponse.json({ message: 'Upsert complete', count: addedCount }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to upsert items to playlist' }, { status: 500 });
  }
}

// GET /api/playlists/[id]/items
export async function GET(request: NextRequest) {
  // Extract playlistId from the URL
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) {
    return NextResponse.json({ error: 'Playlist ID is required in the URL' }, { status: 400 });
  }

  // Ensure playlist exists
  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) {
    return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
  }

  // Fetch playlist items with item details
  const playlistItems = await prisma.playlistItem.findMany({
    where: { playlistId },
    orderBy: { itemOrder: 'asc' },
    include: { item: true },
  });

  const items = playlistItems.map(pi => ({
    id: pi.item.id,
    title: pi.item.title,
    startTime: pi.item.startTime,
    endTime: pi.item.endTime,
    screenshot: pi.item.screenshot,
    stream: pi.item.stream,
    itemOrder: pi.itemOrder,
  }));

  return NextResponse.json({ items }, { status: 200 });
}

// DELETE /api/playlists/[id]/items
export async function DELETE(request: NextRequest) {
  // Extract playlistId from the URL
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) {
    return NextResponse.json({ error: 'Playlist ID is required in the URL' }, { status: 400 });
  }

  // Parse request body to get itemId
  const { itemId } = await request.json();
  if (!itemId) {
    return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
  }

  try {
    // Delete the PlaylistItem (removes item from playlist, but not the item itself)
    await prisma.playlistItem.deleteMany({
      where: { playlistId, itemId },
    });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to remove item from playlist', details: String(error) }, { status: 500 });
  }
}
