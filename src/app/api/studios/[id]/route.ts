// src/app/api/studios/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const studio = await prisma.studio.findUnique({
    where: { id },
  });
  if (!studio) {
    return NextResponse.json({ error: 'Studio not found' }, { status: 404 });
  }
  return NextResponse.json(studio);
}
