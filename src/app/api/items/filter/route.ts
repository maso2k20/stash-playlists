import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

// POST /api/items/filter - Filter item IDs by minimum or exact rating
export async function POST(request: NextRequest) {
  let body: {
    itemIds: string[];
    minRating?: number;
    exactRating?: number;
  };

  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON');
  }

  const { itemIds, minRating, exactRating } = body;

  if (!Array.isArray(itemIds)) {
    return jsonError(400, 'itemIds must be an array');
  }

  const hasExact = typeof exactRating === 'number' && exactRating >= 1 && exactRating <= 5;
  const hasMin = typeof minRating === 'number' && minRating >= 1 && minRating <= 5;

  if (!hasExact && !hasMin) {
    return jsonError(400, 'minRating or exactRating must be a number between 1 and 5');
  }

  try {
    const ratingWhere = hasExact ? { equals: exactRating! } : { gte: minRating! };

    const itemsWithRatings = await prisma.item.findMany({
      where: {
        id: { in: itemIds },
        rating: ratingWhere,
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