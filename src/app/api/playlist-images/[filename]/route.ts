import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Image storage directory - use /data for Docker persistent storage
const IMAGES_DIR = process.env.NODE_ENV === 'production' 
  ? '/data/playlist-images' 
  : path.join(process.cwd(), 'data', 'playlist-images');

function getFilenameFromUrl(request: NextRequest): string | null {
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  return parts[2] || null; // /api/playlist-images/[filename]
}

// GET - Serve playlist image
export async function GET(request: NextRequest) {
  try {
    const filename = getFilenameFromUrl(request);
    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    const filepath = path.join(IMAGES_DIR, filename);

    if (!existsSync(filepath)) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Read the file
    const imageBuffer = await readFile(filepath);

    // Determine content type based on file extension
    const ext = filename.split('.').pop()?.toLowerCase();
    let contentType = 'image/jpeg'; // default

    switch (ext) {
      case 'png':
        contentType = 'image/png';
        break;
      case 'webp':
        contentType = 'image/webp';
        break;
      case 'jpg':
      case 'jpeg':
      default:
        contentType = 'image/jpeg';
        break;
    }

    // Return the image with appropriate headers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
        'Content-Length': imageBuffer.length.toString()
      }
    });

  } catch (error) {
    console.error('Image serve error:', error);
    return NextResponse.json({ 
      error: 'Failed to serve image' 
    }, { status: 500 });
  }
}