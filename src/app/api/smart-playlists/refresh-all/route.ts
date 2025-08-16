// src/app/api/smart-playlists/refresh-all/route.ts

import { NextRequest, NextResponse } from "next/server";
import { refreshAllSmartPlaylists, getRefreshStatus, restartRefreshScheduler } from "@/lib/smartPlaylistRefreshService";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action === 'restart-scheduler') {
      // Restart the scheduler (useful when settings change)
      await restartRefreshScheduler();
      return NextResponse.json({ 
        success: true, 
        message: 'Scheduler restarted successfully' 
      });
    }

    // Default action: refresh all playlists (manual refresh)
    const result = await refreshAllSmartPlaylists('manual');
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Successfully refreshed ${result.refreshedPlaylists} smart playlist(s)`,
        data: {
          refreshedPlaylists: result.refreshedPlaylists,
          duration: result.duration,
          errors: result.errors,
        }
      });
    } else {
      return NextResponse.json({
        success: false,
        message: `Refresh completed with errors. Refreshed: ${result.refreshedPlaylists}`,
        data: {
          refreshedPlaylists: result.refreshedPlaylists,
          duration: result.duration,
          errors: result.errors,
        }
      }, { status: 207 }); // 207 Multi-Status for partial success
    }
  } catch (error) {
    console.error('[API] Error in refresh-all endpoint:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error during refresh',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'history') {
      // Return refresh history
      try {
        const history = await prisma.refreshLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10, // Last 10 refresh operations
          select: {
            id: true,
            refreshType: true,
            success: true,
            refreshedPlaylists: true,
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
        console.error('[API] Database error getting refresh history:', dbError);
        return NextResponse.json({
          success: false,
          message: 'Database error getting refresh history',
          error: dbError instanceof Error ? dbError.message : 'Unknown database error'
        }, { status: 500 });
      }
    }

    // Default: return current refresh status
    const status = await getRefreshStatus();
    
    return NextResponse.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('[API] Error getting refresh data:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to get refresh data',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}