import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

// GET /api/items/ratings?ids=id1,id2,id3
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids');
  
  if (!idsParam) {
    return jsonError(400, 'ids parameter is required');
  }

  const ids = idsParam.split(',').filter(id => id.trim().length > 0);
  
  if (ids.length === 0) {
    return jsonError(400, 'At least one valid ID is required');
  }

  try {
    const items = await prisma.item.findMany({
      where: {
        id: { in: ids },
        rating: { not: null }, // Only return items that have ratings
      },
      select: {
        id: true,
        rating: true,
      },
    });

    // Convert to a map for easy lookup
    const ratingsMap: Record<string, number> = {};
    items.forEach(item => {
      if (item.rating !== null) {
        ratingsMap[item.id] = item.rating;
      }
    });

    return NextResponse.json({
      success: true,
      ratings: ratingsMap,
    });
  } catch (error) {
    console.error('Failed to get item ratings:', error);
    return jsonError(500, 'Failed to get ratings');
  }
}