import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';

const prisma = new PrismaClient();

// Image storage directory - use /data for Docker persistent storage
const IMAGES_DIR = process.env.NODE_ENV === 'production' 
  ? '/data/playlist-images' 
  : path.join(process.cwd(), 'data', 'playlist-images');

// Supported image types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

async function ensureImagesDir() {
  if (!existsSync(IMAGES_DIR)) {
    await mkdir(IMAGES_DIR, { recursive: true });
  }
}

function getPlaylistIdFromUrl(request: NextRequest): string | null {
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  return parts[2] || null; // /api/playlists/[id]/image
}

// POST - Upload playlist image
export async function POST(request: NextRequest) {
  try {
    const playlistId = getPlaylistIdFromUrl(request);
    if (!playlistId) {
      return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
    }

    // Verify playlist exists
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { id: true, image: true }
    });

    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' 
      }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: 'File too large. Maximum size is 5MB.' 
      }, { status: 400 });
    }

    // Generate unique filename
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const filename = `${playlistId}-${uuidv4()}.${fileExtension}`;
    const filepath = path.join(IMAGES_DIR, filename);

    // Ensure images directory exists
    await ensureImagesDir();

    // Process and save image
    const buffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    // Resize to portrait 9:16 ratio (270x480) and optimize
    const processedImage = await sharp(uint8Array)
      .resize(270, 480, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    await writeFile(filepath, processedImage);

    // Delete old image if it exists
    if (playlist.image) {
      try {
        const oldPath = path.join(IMAGES_DIR, playlist.image);
        await unlink(oldPath);
      } catch (error) {
        console.warn('Failed to delete old image:', error);
      }
    }

    // Update database
    const updatedPlaylist = await prisma.playlist.update({
      where: { id: playlistId },
      data: { image: filename }
    });

    return NextResponse.json({ 
      message: 'Image uploaded successfully',
      filename: filename,
      imageUrl: `/api/playlist-images/${filename}`
    }, { status: 200 });

  } catch (error) {
    console.error('Image upload error:', error);
    return NextResponse.json({ 
      error: 'Failed to upload image' 
    }, { status: 500 });
  }
}

// DELETE - Remove playlist image
export async function DELETE(request: NextRequest) {
  try {
    const playlistId = getPlaylistIdFromUrl(request);
    if (!playlistId) {
      return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
    }

    // Get current playlist image
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { id: true, image: true }
    });

    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    if (!playlist.image) {
      return NextResponse.json({ error: 'No image to delete' }, { status: 400 });
    }

    // Delete file
    try {
      const filepath = path.join(IMAGES_DIR, playlist.image);
      await unlink(filepath);
    } catch (error) {
      console.warn('Failed to delete image file:', error);
    }

    // Update database
    await prisma.playlist.update({
      where: { id: playlistId },
      data: { image: null }
    });

    return NextResponse.json({ 
      message: 'Image deleted successfully' 
    }, { status: 200 });

  } catch (error) {
    console.error('Image delete error:', error);
    return NextResponse.json({ 
      error: 'Failed to delete image' 
    }, { status: 500 });
  }
}