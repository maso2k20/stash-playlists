import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

// POST /api/items - Create a new item
export async function POST(request: NextRequest) {
  let body: {
    id: string;
    title?: string;
    startTime?: number;
    endTime?: number;
    screenshot?: string | null;
    stream?: string | null;
    preview?: string | null;
    rating?: number | null;
  };

  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON');
  }

  const { id, title, startTime, endTime, screenshot, stream, preview, rating } = body;

  if (!id) {
    return jsonError(400, 'Item ID is required');
  }

  // Validate rating if provided
  if (rating !== null && rating !== undefined) {
    if (typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return jsonError(400, 'Rating must be an integer between 1 and 5, or null');
    }
  }

  try {
    // Check if item already exists
    const existingItem = await prisma.item.findUnique({
      where: { id },
    });

    if (existingItem) {
      return jsonError(409, 'Item already exists');
    }

    // Create the item
    const newItem = await prisma.item.create({
      data: {
        id,
        title: title || '',
        startTime: startTime || 0,
        endTime: endTime || 0,
        screenshot: screenshot || null,
        stream: stream || null,
        preview: preview || null,
        rating: rating || null,
      },
    });

    return NextResponse.json({
      success: true,
      item: newItem,
    });
  } catch (error) {
    console.error('Failed to create item:', error);
    return jsonError(500, 'Failed to create item');
  }
}

// GET /api/items - Get all items (optional, for debugging)
export async function GET() {
  try {
    const items = await prisma.item.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Failed to get items:', error);
    return jsonError(500, 'Failed to get items');
  }
}