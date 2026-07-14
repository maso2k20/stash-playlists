// app/api/actor-marker-counts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { actorMarkerCountService } from "@/lib/actorMarkerCountService";

// GET /api/actor-marker-counts - status, or ?action=history
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "history") {
      const { default: prisma } = await import("@/lib/prisma");
      try {
        const history = await prisma.refreshLog.findMany({
          where: { refreshType: { startsWith: "actor-marker-count-" } },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            refreshType: true,
            success: true,
            refreshedPlaylists: true, // actors updated
            errors: true,
            duration: true,
            createdAt: true,
          },
        });
        return NextResponse.json({ success: true, data: history });
      } catch (dbError) {
        console.error("❌ Database error getting marker-count history:", dbError);
        return NextResponse.json(
          { success: false, message: "Database error getting marker-count history", error: dbError instanceof Error ? dbError.message : "Unknown database error" },
          { status: 500 }
        );
      }
    }

    const status = await actorMarkerCountService.getScheduleStatus();
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    console.error("❌ Failed to get marker-count status:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/actor-marker-counts
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const action = body?.action;

    switch (action) {
      case "refresh": {
        console.log("🔢 Manual actor marker-count refresh requested");
        const result = await actorMarkerCountService.runRefresh("manual");

        const { default: prisma } = await import("@/lib/prisma");
        await prisma.refreshLog.create({
          data: {
            refreshType: "actor-marker-count-manual",
            success: result.success,
            refreshedPlaylists: result.data.actorsUpdated,
            errors: result.data.errors.length > 0 ? result.data.errors : undefined,
            duration: result.data.duration,
          },
        });

        return NextResponse.json(result);
      }

      case "restart-scheduler": {
        console.log("🔢 Actor marker-count scheduler restart requested");
        await actorMarkerCountService.restartScheduler();
        const status = await actorMarkerCountService.getScheduleStatus();
        return NextResponse.json({ success: true, message: "Actor marker-count scheduler restarted", data: status });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}. Valid actions: refresh, restart-scheduler` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("❌ Actor marker-count API error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error occurred", message: "Actor marker-count operation failed" },
      { status: 500 }
    );
  }
}
