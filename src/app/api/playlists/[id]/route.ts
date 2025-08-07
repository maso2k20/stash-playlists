import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  // Extract playlist ID from the URL
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) {
    return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
  }

  // Fetch the playlist
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
  });

  if (!playlist) {
    return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
  }

  return NextResponse.json(playlist, { status: 200 });
}

export async function POST(request: NextRequest) {
  // Extract playlist ID from the URL
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) {
    return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
  }

  // Parse request body
  const { name, description } = await request.json();

  // Update the playlist
  const updated = await prisma.playlist.update({
    where: { id: playlistId },
    data: {
      name,
      description,
    },
  });

  return NextResponse.json(updated, { status: 200 });
}

export async function PUT(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) {
    return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
  }

  const { name, description, conditions } = await request.json();

  const updated = await prisma.playlist.update({
    where: { id: playlistId },
    data: { name, description, conditions },
  });

  return NextResponse.json(updated, { status: 200 });
}

