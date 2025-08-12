import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

// POST /api/items/filter - Filter item IDs by minimum rating
export async function POST(request: NextRequest) {
  let body: {
    itemIds: string[];
    minRating: number;
  };

  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON');
  }

  const { itemIds, minRating } = body;

  if (!Array.isArray(itemIds)) {
    return jsonError(400, 'itemIds must be an array');
  }

  if (typeof minRating !== 'number' || minRating < 1 || minRating > 5) {
    return jsonError(400, 'minRating must be a number between 1 and 5');
  }

  try {
    // Find items with rating >= minRating
    const itemsWithRatings = await prisma.item.findMany({
      where: {
        id: { in: itemIds },
        rating: { gte: minRating }
      },
      select: { id: true }
    });

    const filteredIds = itemsWithRatings.map(item => item.id);

    return NextResponse.json({
      filteredIds,
      count: filteredIds.length,
    });
  } catch (error) {
    console.error('Failed to filter items by rating:', error);
    return jsonError(500, 'Failed to filter items by rating');
  }
}