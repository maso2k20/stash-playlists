// filepath: c:\stash-playlists\src\app\api\actors\[id]\route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const actor = await prisma.actor.findUnique({
    where: { id: params.id },
  });
  if (!actor) {
    return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
  }
  return NextResponse.json(actor);
}