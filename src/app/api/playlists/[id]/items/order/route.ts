import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  // Extract playlist ID from the URL
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) {
    return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
  }

  // Parse request body
  const { orderedItems } = await request.json();
  if (!Array.isArray(orderedItems)) {
    return NextResponse.json({ error: 'orderedItems must be an array' }, { status: 400 });
  }

  // Update itemOrder for each item
  try {
    for (const { id, itemOrder } of orderedItems) {
      await prisma.playlistItem.updateMany({
        where: { playlistId, itemId: id },
        data: { itemOrder },
      });
    }
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update item order', details: String(error) }, { status: 500 });
  }
}