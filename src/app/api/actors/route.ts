// src/app/api/actors/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';  // adjust path as needed

// GET /api/actors
export async function GET() {
  const actors = await prisma.actor.findMany({
    orderBy: { createdAt: 'desc' }
  });
  return NextResponse.json(actors);
}

// POST /api/actors
// Body: { id: string; name: string; image_path: string; rating: number }
export async function POST(request: Request) {
  const body = await request.json();
  const { id, name, image_path, rating } = body;

  if (!id || !name || typeof rating !== 'number' || !image_path) {
    return NextResponse.json(
      { error: 'Missing or invalid fields (id, name, image_path, rating)' },
      { status: 400 }
    );
  }

  const actor = await prisma.actor.upsert({
    where: { id },
    create: {
      id,
      name,
      image_path,
      rating
    },
    update: {
      name,
      image_path,
      rating
    }
  });

  return NextResponse.json(actor);
}

// DELETE /api/actors?id=<actorId>
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  await prisma.actor.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

