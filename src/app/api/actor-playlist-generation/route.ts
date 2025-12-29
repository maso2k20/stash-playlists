// app/api/actor-playlist-generation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { actorPlaylistGenerationService } from "@/lib/actorPlaylistGenerationService";

// GET /api/actor-playlist-generation - Get generation status or history
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'history') {
      // Return generation history from RefreshLog
      const { default: prisma } = await import("@/lib/prisma");

      try {
        const history = await prisma.refreshLog.findMany({
          where: {
            refreshType: {
              startsWith: 'actor-generation-' // actor-generation-manual or actor-generation-scheduled
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10, // Last 10 generation operations
          select: {
            id: true,
            refreshType: true,
            success: true,
            refreshedPlaylists: true, // Number of playlists created
            errors: true,
            duration: true,
            createdAt: true,
          },
        });

        return NextResponse.json({
          success: true,
          data: history
        });
      } catch (dbError) {
        console.error('❌ Database error getting generation history:', dbError);
        return NextResponse.json({
          success: false,
          message: 'Database error getting generation history',
          error: dbError instanceof Error ? dbError.message : 'Unknown database error'
        }, { status: 500 });
      }
    }

    // Default: return current generation status
    const status = await actorPlaylistGenerationService.getScheduleStatus();

    return NextResponse.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('❌ Failed to get generation status:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

// POST /api/actor-playlist-generation
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const action = body?.action;

    switch (action) {
      case 'generate':
        console.log('🎭 Manual actor playlist generation requested');
        const result = await actorPlaylistGenerationService.runGeneration('manual');

        // Log the result
        const { default: prisma } = await import("@/lib/prisma");
        await prisma.refreshLog.create({
          data: {
            refreshType: 'actor-generation-manual',
            success: result.success,
            refreshedPlaylists: result.data.playlistsCreated,
            errors: result.data.errors.length > 0 ? result.data.errors : undefined,
            duration: result.data.duration
          }
        });

        return NextResponse.json(result);

      case 'restart-scheduler':
        console.log('🎭 Actor generation scheduler restart requested');
        await actorPlaylistGenerationService.restartScheduler();
        const status = await actorPlaylistGenerationService.getScheduleStatus();
        return NextResponse.json({
          success: true,
          message: 'Actor generation scheduler restarted',
          data: status
        });

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown action: ${action}. Valid actions: generate, restart-scheduler`
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('❌ Actor generation API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        message: 'Actor playlist generation operation failed'
      },
      { status: 500 }
    );
  }
}
