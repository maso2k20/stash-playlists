// src/app/api/actors/[id]/build-playlists/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { buildItemsForPlaylist } from '@/lib/smartPlaylistServer';

const prisma = new PrismaClient();

type BuildResult = {
  created: Array<{
    templateName: string;
    playlistId: string;
    playlistName: string;
    itemCount: number;
  }>;
  skipped: Array<{
    templateName: string;
    reason: string;
  }>;
  errors: Array<{
    templateName: string;
    error: string;
  }>;
};

// POST /api/actors/[id]/build-playlists
// Body: { templateIds: string[] }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: actorId } = await params;

  try {
    const body = await request.json();
    const { templateIds } = body;

    if (!templateIds || !Array.isArray(templateIds) || templateIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one template ID is required' },
        { status: 400 }
      );
    }

    // Fetch the actor to get their name
    const actor = await prisma.actor.findUnique({
      where: { id: actorId },
      select: { name: true },
    });

    if (!actor) {
      return NextResponse.json(
        { error: 'Actor not found' },
        { status: 404 }
      );
    }

    // Fetch the selected templates
    const templates = await prisma.playlistTemplate.findMany({
      where: { id: { in: templateIds } },
    });

    if (templates.length === 0) {
      return NextResponse.json(
        { error: 'No valid templates found' },
        { status: 404 }
      );
    }

    const result: BuildResult = {
      created: [],
      skipped: [],
      errors: [],
    };

    // Process each template
    for (const template of templates) {
      const playlistName = `${actor.name} - ${template.name}`;

      try {
        // Check if a playlist with this name already exists
        const existing = await prisma.playlist.findFirst({
          where: { name: playlistName },
        });

        if (existing) {
          result.skipped.push({
            templateName: template.name,
            reason: `Playlist "${playlistName}" already exists`,
          });
          continue;
        }

        // Create the smart playlist with the actor and template tags
        // Use new format if available, fall back to legacy tagIds
        // Check if requiredTagIds exists (even if empty) vs undefined/null (legacy)
        const templateTagIds = template.tagIds as string[];
        const requiredTagIds = template.requiredTagIds !== undefined && template.requiredTagIds !== null
          ? (template.requiredTagIds as string[])
          : templateTagIds; // Fallback to legacy only if new fields don't exist
        const optionalTagIds = (template.optionalTagIds as string[] | null) ?? [];

        const playlist = await prisma.playlist.create({
          data: {
            name: playlistName,
            description: `Auto-generated from template "${template.name}"`,
            type: 'SMART',
            conditions: {
              actorIds: [actorId],
              requiredTagIds,
              optionalTagIds,
              // Keep legacy tagIds for backward compatibility
              tagIds: templateTagIds,
            },
          },
        });

        // Refresh the playlist to populate items
        let itemCount = 0;
        try {
          const items = await buildItemsForPlaylist(playlist.id);
          itemCount = items.length;

          // Sync items to the playlist
          if (items.length > 0) {
            // First, clear any existing items
            await prisma.playlistItem.deleteMany({
              where: { playlistId: playlist.id },
            });

            // Create or update items and link to playlist
            for (let i = 0; i < items.length; i++) {
              const item = items[i];

              // Upsert the item
              await prisma.item.upsert({
                where: { id: item.id },
                create: {
                  id: item.id,
                  title: item.title ?? 'Untitled',
                  startTime: item.startTime ?? 0,
                  endTime: item.endTime ?? 0,
                  screenshot: item.screenshot,
                  stream: item.stream,
                  preview: item.preview,
                  sceneId: item.sceneId,
                },
                update: {
                  title: item.title ?? 'Untitled',
                  startTime: item.startTime ?? 0,
                  endTime: item.endTime ?? 0,
                  screenshot: item.screenshot,
                  stream: item.stream,
                  preview: item.preview,
                  sceneId: item.sceneId,
                },
              });

              // Create the playlist item link
              await prisma.playlistItem.create({
                data: {
                  playlistId: playlist.id,
                  itemId: item.id,
                  itemOrder: i,
                },
              });
            }
          }
        } catch (refreshError) {
          // Playlist created but refresh failed - still count as created
          console.error(`Failed to refresh playlist ${playlist.id}:`, refreshError);
        }

        result.created.push({
          templateName: template.name,
          playlistId: playlist.id,
          playlistName,
          itemCount,
        });
      } catch (error) {
        result.errors.push({
          templateName: template.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${result.created.length} playlist(s), skipped ${result.skipped.length}`,
      ...result,
    });
  } catch (error) {
    console.error('Failed to build playlists:', error);
    return NextResponse.json(
      { error: 'Failed to build playlists' },
      { status: 500 }
    );
  }
}
