// src/app/api/studios/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractRelativePath } from '@/lib/urlUtils';

// GET /api/studios
export async function GET() {
  const studios = await prisma.studio.findMany({
    orderBy: { createdAt: 'desc' }
  });
  return NextResponse.json(studios);
}

// POST /api/studios
// Body: { id: string; name: string; image_path?: string | null; parentName?: string | null }
export async function POST(request: Request) {
  const body = await request.json();
  const { id, name, image_path, parentName } = body;

  if (!id || !name) {
    return NextResponse.json(
      { error: 'Missing or invalid fields (id, name)' },
      { status: 400 }
    );
  }

  // Convert full URL to relative path for storage
  const relativeImagePath = image_path ? extractRelativePath(image_path) : null;

  const studio = await prisma.studio.upsert({
    where: { id: String(id) },
    create: {
      id: String(id),
      name,
      image_path: relativeImagePath,
      parentName: parentName ?? null,
    },
    update: {
      name,
      image_path: relativeImagePath,
      parentName: parentName ?? null,
    }
  });

  return NextResponse.json(studio);
}

// DELETE /api/studios?id=<studioId>
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  await prisma.studio.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
