// src/app/api/smart-playlists/preview/route.ts
//
// Server-side preview for the smart-playlist editor. Accepts conditions in
// the request body and returns the markers that match — using the same
// fetchFilteredStashMarkers function the refresh flow uses, so editor
// preview and refresh always agree on the result.
//
// Lives at /api/smart-playlists/preview (general-purpose, no playlist ID)
// because the editor previews unsaved conditions.

import { NextRequest, NextResponse } from "next/server";
import {
  fetchFilteredStashMarkers,
  type SmartPlaylistConditions,
} from "@/lib/smartPlaylistServer";

export async function POST(request: NextRequest) {
  let payload: { conditions?: SmartPlaylistConditions };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const conditions = payload?.conditions;
  if (!conditions || typeof conditions !== "object") {
    return NextResponse.json(
      { error: "`conditions` object is required" },
      { status: 400 },
    );
  }

  try {
    const markers = await fetchFilteredStashMarkers(conditions);
    return NextResponse.json({ markers, count: markers.length }, { status: 200 });
  } catch (error: any) {
    console.error("[/api/smart-playlists/preview] error:", error);
    return NextResponse.json(
      { error: `Failed to build preview: ${error?.message ?? String(error)}` },
      { status: 500 },
    );
  }
}
