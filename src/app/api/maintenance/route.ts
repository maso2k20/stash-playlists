// app/api/maintenance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { maintenanceService } from "@/lib/maintenanceService";

// GET /api/maintenance - Get maintenance status or history
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'history') {
      // Return maintenance history from RefreshLog
      const { prisma } = await import("@/lib/prisma");
      
      try {
        const history = await prisma.refreshLog.findMany({
          where: {
            refreshType: {
              startsWith: 'maintenance-' // maintenance-manual or maintenance-scheduled
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10, // Last 10 maintenance operations
          select: {
            id: true,
            refreshType: true,
            success: true,
            refreshedPlaylists: true, // Will be 0 for maintenance operations
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
        console.error('❌ Database error getting maintenance history:', dbError);
        return NextResponse.json({
          success: false,
          message: 'Database error getting maintenance history',
          error: dbError instanceof Error ? dbError.message : 'Unknown database error'
        }, { status: 500 });
      }
    }

    // Default: return current maintenance status
    const status = await maintenanceService.getScheduleStatus();
    
    return NextResponse.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('❌ Failed to get maintenance status:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

// POST /api/maintenance
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const action = body?.action;

    switch (action) {
      case 'run-check':
        console.log('🔧 Manual maintenance check requested');
        const result = await maintenanceService.runMaintenanceCheck();
        return NextResponse.json(result);

      case 'restart-scheduler':
        console.log('🔧 Maintenance scheduler restart requested');
        await maintenanceService.startScheduler();
        const status = await maintenanceService.getScheduleStatus();
        return NextResponse.json({
          success: true,
          message: 'Maintenance scheduler restarted',
          data: status
        });

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown action: ${action}. Valid actions: run-check, restart-scheduler`
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('❌ Maintenance API error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        message: 'Maintenance operation failed'
      },
      { status: 500 }
    );
  }
}