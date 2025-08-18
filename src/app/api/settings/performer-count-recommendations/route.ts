// src/app/api/settings/performer-count-recommendations/route.ts

import { NextResponse } from "next/server";
import { getPerformerCountTagRecommendations } from "@/lib/settingsDefinitions";

export async function GET() {
  try {
    const recommendations = await getPerformerCountTagRecommendations();
    
    return NextResponse.json({
      success: true,
      recommendations
    });
  } catch (error) {
    console.error('Failed to get performer count recommendations:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get recommendations',
        recommendations: {}
      },
      { status: 500 }
    );
  }
}