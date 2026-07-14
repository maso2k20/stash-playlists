import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

// POST /api/items/[id]/play
// Increment the marker's play count (called when a clip finishes playing in a
// playlist) and stamp lastPlayedAt.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: itemId } = await params;

  if (!itemId) {
    return jsonError(400, 'Item ID is required');
  }

  try {
    const updated = await prisma.item.update({
      where: { id: itemId },
      data: {
        playCount: { increment: 1 },
        lastPlayedAt: new Date(),
      },
      select: { id: true, playCount: true, lastPlayedAt: true },
    });

    return NextResponse.json({ success: true, item: updated });
  } catch (error) {
    // P2025 = record not found; treat as a no-op rather than a hard error so a
    // stray play event never breaks playback.
    if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === 'P2025') {
      return jsonError(404, 'Item not found');
    }
    console.error('Failed to increment item play count:', error);
    return jsonError(500, 'Failed to record play');
  }
}
