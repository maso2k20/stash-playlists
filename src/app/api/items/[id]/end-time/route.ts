import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PATCH /api/items/[id]/end-time  { endTime: number }  (absolute seconds in the scene)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: itemId } = await params;

  let body: { endTime?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const endTime = Number(body.endTime);
  if (!Number.isFinite(endTime) || endTime <= 0) {
    return NextResponse.json({ error: 'endTime must be a positive number' }, { status: 400 });
  }

  const existing = await prisma.item.findUnique({
    where: { id: itemId },
    select: { startTime: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }
  if (endTime <= existing.startTime) {
    return NextResponse.json({ error: 'endTime must be after the clip start' }, { status: 400 });
  }

  try {
    const item = await prisma.item.update({
      where: { id: itemId },
      data: { endTime },
      select: { id: true, startTime: true, endTime: true },
    });
    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('Failed to update item end time:', error);
    return NextResponse.json({ error: 'Failed to update end time' }, { status: 500 });
  }
}
