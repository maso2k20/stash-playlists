// src/app/api/studios/counts/route.ts
import { NextResponse } from 'next/server';
import { refreshStudioCounts } from '@/lib/studioCountService';

export const dynamic = 'force-dynamic';

// POST /api/studios/counts — refresh precomputed marker / unorganised counts
export async function POST() {
  try {
    const result = await refreshStudioCounts();
    return NextResponse.json({ success: result.errors.length === 0, ...result });
  } catch (error) {
    console.error('[POST /api/studios/counts] error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
