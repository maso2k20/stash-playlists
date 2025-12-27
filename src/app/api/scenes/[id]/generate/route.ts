import { NextRequest, NextResponse } from 'next/server';
import { stashGraph } from '@/lib/smartPlaylistServer';

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

// POST /api/scenes/[id]/generate
// Triggers Stash metadataGenerate mutation for the scene's markers
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sceneId } = await params;

  if (!sceneId) {
    return jsonError(400, 'Scene ID is required');
  }

  try {
    const mutation = `
      mutation MetadataGenerate($input: GenerateMetadataInput!) {
        metadataGenerate(input: $input)
      }
    `;

    const variables = {
      input: {
        markers: true,
        markerImagePreviews: true,
        markerScreenshots: true,
        overwrite: false,
        sceneIDs: [sceneId],
      },
    };

    await stashGraph(mutation, variables);

    return NextResponse.json({
      success: true,
      message: 'Generate task triggered',
    });
  } catch (error) {
    console.error('Failed to trigger generate task:', error);
    return jsonError(500, 'Failed to trigger generate task');
  }
}
