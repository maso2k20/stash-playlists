// app/api/maintenance/backfill-scene-ids/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// POST /api/maintenance/backfill-scene-ids
export async function POST() {
  try {
    console.log('🔧 Starting scene ID backfill process...');
    
    // Find all items that have stream URLs but no sceneId
    const itemsToBackfill = await prisma.item.findMany({
      where: {
        AND: [
          { sceneId: null },
          { stream: { not: null } },
          { stream: { not: '' } }
        ]
      },
      select: { id: true, stream: true }
    });

    console.log(`🔧 Found ${itemsToBackfill.length} items to backfill`);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Extract scene ID from stream URL using regex
    // Expected format: http://server/scene/{sceneId}/stream?api_key=...
    const sceneIdRegex = /\/scene\/(\d+)\/stream/;

    for (const item of itemsToBackfill) {
      try {
        if (!item.stream) continue;

        const match = item.stream.match(sceneIdRegex);
        if (match && match[1]) {
          const sceneId = match[1];
          
          // Update the item with the extracted scene ID
          await prisma.item.update({
            where: { id: item.id },
            data: { sceneId }
          });
          
          successCount++;
          console.log(`✅ Updated item ${item.id} with scene ID ${sceneId}`);
        } else {
          errorCount++;
          const error = `Could not extract scene ID from stream URL: ${item.stream}`;
          errors.push(`Item ${item.id}: ${error}`);
          console.warn(`⚠️ ${error}`);
        }
      } catch (error) {
        errorCount++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Item ${item.id}: ${errorMsg}`);
        console.error(`❌ Error updating item ${item.id}:`, error);
      }
    }

    const result = {
      success: true,
      message: `Backfill completed: ${successCount} items updated`,
      data: {
        totalItems: itemsToBackfill.length,
        successCount,
        errorCount,
        errors: errors.length > 0 ? errors : null
      }
    };

    console.log('🔧 Scene ID backfill complete:', result.data);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('❌ Scene ID backfill failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        message: 'Failed to backfill scene IDs'
      },
      { status: 500 }
    );
  }
}

// GET /api/maintenance/backfill-scene-ids - Get status
export async function GET() {
  try {
    // Count items that need backfilling
    const totalItems = await prisma.item.count();
    const itemsWithSceneId = await prisma.item.count({
      where: { sceneId: { not: null } }
    });
    const itemsNeedingBackfill = await prisma.item.count({
      where: {
        AND: [
          { sceneId: null },
          { stream: { not: null } },
          { stream: { not: '' } }
        ]
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        totalItems,
        itemsWithSceneId,
        itemsNeedingBackfill,
        backfillPercentage: totalItems > 0 ? Math.round((itemsWithSceneId / totalItems) * 100) : 0
      }
    });
  } catch (error) {
    console.error('❌ Failed to get backfill status:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}