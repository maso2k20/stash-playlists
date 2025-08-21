// src/app/api/playlists/[id]/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildItemsForPlaylist } from "@/lib/smartPlaylistServer";

type IncomingItem = {
  id: string;
  title?: string;
  startTime?: number;
  endTime?: number;
  screenshot?: string | null;
  stream?: string | null;
  preview?: string | null;
  rating?: number | null;
  sceneId?: string | null;
  itemOrder?: number;
};

function pickDefined<T extends Record<string, any>>(obj: T) {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as any)[k] = v; // keep nulls to intentionally clear
  }
  return out;
}

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Normalize any array of items coming either from the editor or the builder.
 * IMPORTANT: Only include optional media fields if they actually exist on the payload.
 * - absent  => undefined  (DB untouched)
 * - null    => clear DB column
 * - string  => set DB column
 */
function normalizeIncoming(items: any[]): IncomingItem[] {
  const seen = new Set<string>();
  const incoming: IncomingItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const raw = items[i]?.item ?? items[i];
    if (!raw || typeof raw.id !== "string" || !raw.id.trim()) continue;

    if (seen.has(raw.id)) continue;
    seen.add(raw.id);

    const start = raw.startTime ?? raw.seconds ?? raw.start ?? raw.start_time;
    const end = raw.endTime ?? raw.end ?? raw.end_time;
    if (start == null || end == null) continue;

    incoming.push({
      id: raw.id,
      title: raw.title ?? "",
      startTime: typeof start === "number" ? start : Number(start),
      endTime: typeof end === "number" ? end : Number(end),

      screenshot: Object.prototype.hasOwnProperty.call(raw, "screenshot")
        ? (raw.screenshot as string | null | undefined) ?? null
        : undefined,
      stream: Object.prototype.hasOwnProperty.call(raw, "stream")
        ? (raw.stream as string | null | undefined) ?? null
        : undefined,
      preview: Object.prototype.hasOwnProperty.call(raw, "preview")
        ? (raw.preview as string | null | undefined) ?? null
        : undefined,
      rating: Object.prototype.hasOwnProperty.call(raw, "rating")
        ? (raw.rating as number | null | undefined) ?? null
        : undefined,
      sceneId: Object.prototype.hasOwnProperty.call(raw, "sceneId")
        ? (raw.sceneId as string | null | undefined) ?? null
        : undefined,

      itemOrder: typeof items[i]?.order === "number" ? items[i].order :
                 typeof raw.itemOrder === "number" ? raw.itemOrder : undefined,
    });
  }
  return incoming;
}

async function syncItems(
  playlistId: string,
  incoming: IncomingItem[],
  opts: { preserveTimings?: boolean } = {}
) {
  const preserveTimings = !!opts.preserveTimings;

  return prisma.$transaction(async (tx) => {
    const existingLinks = await tx.playlistItem.findMany({
      where: { playlistId },
      select: { id: true, itemId: true, itemOrder: true },
    });
    const existingByItemId = new Map(existingLinks.map((e) => [e.itemId, e]));
    const incomingIds = incoming.map((i) => i.id);

    const existingItems = await tx.item.findMany({
      where: { id: { in: incomingIds } },
      select: { id: true },
    });
    const existingItemMap = new Map(existingItems.map((x) => [x.id, x]));

    let upsertedItems = 0;
    let linkedCreated = 0;
    let linkedUpdated = 0;
    let deleted = 0;

    for (let index = 0; index < incoming.length; index++) {
      const it = incoming[index];
      const exists = existingItemMap.has(it.id);

      const shouldWriteTimings = !preserveTimings || !exists;

      const updateData = pickDefined({
        title: it.title,
        startTime: shouldWriteTimings ? it.startTime : undefined,
        endTime: shouldWriteTimings ? it.endTime : undefined,
        // Media only if present (undefined keys are dropped)
        screenshot: it.screenshot,
        stream: it.stream,
        preview: it.preview,
        rating: it.rating,
        sceneId: it.sceneId,
      });

      await tx.item.upsert({
        where: { id: it.id },
        update: updateData,
        create: {
          id: it.id,
          title: it.title ?? "",
          startTime: it.startTime ?? 0,
          endTime: it.endTime ?? 0,
          screenshot: it.screenshot ?? null,
          stream: it.stream ?? null,
          preview: it.preview ?? null,
          rating: it.rating ?? null,
          sceneId: it.sceneId ?? null,
        },
      });
      upsertedItems++;

      const desiredOrder =
        typeof it.itemOrder === "number" ? it.itemOrder : index;
      const link = existingByItemId.get(it.id);

      if (link) {
        if (link.itemOrder !== desiredOrder) {
          await tx.playlistItem.update({
            where: { id: link.id },
            data: { itemOrder: desiredOrder },
          });
          linkedUpdated++;
        }
      } else {
        const created = await tx.playlistItem.create({
          data: { playlistId, itemId: it.id, itemOrder: desiredOrder },
        });
        existingByItemId.set(created.itemId, created);
        linkedCreated++;
      }
    }

    // prune removed links
    const incomingSet = new Set(incomingIds);
    const toDelete = existingLinks
      .filter((e) => !incomingSet.has(e.itemId))
      .map((e) => e.id);
    if (toDelete.length) {
      const res = await tx.playlistItem.deleteMany({
        where: { id: { in: toDelete } },
      });
      deleted = res.count;
    }

    return { upsertedItems, linkedCreated, linkedUpdated, deleted };
  });
}

// POST /api/playlists/[id]/items
export async function POST(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const parts = pathname.split("/").filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) return jsonError(400, "Playlist ID is required in the URL");

  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) return jsonError(404, "Playlist not found");

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  if (payload?.clear === true) {
    await prisma.playlistItem.deleteMany({ where: { playlistId } });
    return NextResponse.json({ message: "Playlist cleared" }, { status: 200 });
  }

  // Refresh/regenerate path (or missing items array)
  if (payload?.refresh === true || payload?.regenerate === true || !Array.isArray(payload?.items)) {
    const built = await buildItemsForPlaylist(playlistId);
    const incoming = normalizeIncoming(built ?? []);

    // Check if this is a smart playlist with rating filter that returned no results
    // In this case, don't clear the playlist, just return current state
    if (incoming.length === 0) {
      const playlist = await prisma.playlist.findUnique({
        where: { id: playlistId },
        select: { type: true, conditions: true }
      });
      
      if (playlist?.type === "SMART") {
        const conditions = (playlist.conditions as any) || {};
        const hasRatingFilter = conditions.minRating && conditions.minRating >= 1;
        
        if (hasRatingFilter) {
          // Don't clear playlist when rating filter returns no results
          // This preserves existing items until markers are actually rated
          const totalLinkedNow = await prisma.playlistItem.count({ where: { playlistId } });
          return NextResponse.json(
            {
              message: "No items match rating filter - playlist unchanged",
              upsertedItems: 0,
              linkedCreated: 0,
              linkedUpdated: 0,
              deleted: 0,
              totalLinkedNow,
            },
            { status: 200 }
          );
        }
      }
    }

    const result = await syncItems(playlistId, incoming, {
      preserveTimings: payload?.refresh === true && payload?.regenerate !== true,
    });
    const totalLinkedNow = await prisma.playlistItem.count({ where: { playlistId } });
    return NextResponse.json(
      {
        message: payload?.regenerate ? "Regenerated from rules" : "Refreshed from rules",
        ...result,
        totalLinkedNow,
      },
      { status: 200 }
    );
  }

  // Manual sync (editor Save)
  if (!Array.isArray(payload.items)) {
    return jsonError(400, "`items` must be an array.");
  }
  const incoming = normalizeIncoming(payload.items);
  if (!incoming.length) return jsonError(400, "No valid items provided.");

  try {
    const result = await syncItems(playlistId, incoming, { preserveTimings: false });
    const totalLinkedNow = await prisma.playlistItem.count({ where: { playlistId } });
    return NextResponse.json(
      { message: "Sync complete", ...result, totalLinkedNow },
      { status: 200 }
    );
  } catch (error: any) {
    let code: string | undefined;
    let meta: any;
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      code = error.code;
      meta = error.meta;
    }
    console.error("Sync error:", error);
    return jsonError(500, "Failed to sync items to playlist", { code, meta });
  }
}

// GET /api/playlists/[id]/items
export async function GET(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const parts = pathname.split("/").filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) return jsonError(400, "Playlist ID is required in the URL");

  const rows = await prisma.playlistItem.findMany({
    where: { playlistId },
    orderBy: { itemOrder: "asc" },
    select: {
      itemOrder: true,
      item: {
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          screenshot: true,
          stream: true,
          preview: true,
          rating: true,
        },
      },
    },
  });

  const items = rows.map((pi) => ({
    id: pi.item.id,
    title: pi.item.title,
    startTime: pi.item.startTime,
    endTime: pi.item.endTime,
    screenshot: pi.item.screenshot ?? undefined,
    stream: pi.item.stream ?? undefined,
    preview: pi.item.preview ?? undefined,
    rating: pi.item.rating ?? undefined,
    itemOrder: pi.itemOrder,
  }));

  return NextResponse.json({ items }, { status: 200 });
}

// DELETE /api/playlists/[id]/items
export async function DELETE(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const parts = pathname.split("/").filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) return jsonError(400, "Playlist ID is required in the URL");

  let body: { itemId?: string };
  try { body = await request.json(); } catch { return jsonError(400, "Invalid JSON"); }

  const itemId = body?.itemId;
  if (!itemId) return jsonError(400, "itemId is required");

  try {
    const res = await prisma.playlistItem.deleteMany({ where: { playlistId, itemId: body.itemId } });
    return NextResponse.json({ success: true, removed: res.count }, { status: 200 });
  } catch (error) {
    console.error(error);
    return jsonError(500, "Failed to remove item from playlist", { details: String(error) });
  }
}
