import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

// PATCH /api/items/[id]/rating
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: itemId } = await params;
  
  if (!itemId) {
    return jsonError(400, 'Item ID is required');
  }

  let body: { rating?: number | null };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON');
  }

  const { rating } = body;

  // Validate rating value
  if (rating !== null && rating !== undefined) {
    if (typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return jsonError(400, 'Rating must be an integer between 1 and 5, or null to clear');
    }
  }

  try {
    // Check if item exists
    const existingItem = await prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, rating: true },
    });

    if (!existingItem) {
      return jsonError(404, 'Item not found');
    }

    // Update the rating
    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: { rating: rating === undefined ? existingItem.rating : rating },
      select: {
        id: true,
        title: true,
        rating: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      item: updatedItem,
    });
  } catch (error) {
    console.error('Failed to update item rating:', error);
    return jsonError(500, 'Failed to update rating');
  }
}

// GET /api/items/[id]/rating
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: itemId } = await params;
  
  if (!itemId) {
    return jsonError(400, 'Item ID is required');
  }

  try {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        title: true,
        rating: true,
      },
    });

    if (!item) {
      return jsonError(404, 'Item not found');
    }

    return NextResponse.json({
      item,
    });
  } catch (error) {
    console.error('Failed to get item rating:', error);
    return jsonError(500, 'Failed to get rating');
  }
}