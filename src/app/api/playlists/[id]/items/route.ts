// src/app/api/playlists/[id]/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { buildItemsForPlaylist } from "@/lib/smartPlaylistServer"; // shared server-side builder

const prisma = new PrismaClient();

type PlaylistType = "MANUAL" | "SMART" | "AUTOMATIC";

type IncomingItem = {
  id: string;
  title?: string;
  startTime?: number;
  endTime?: number;
  screenshot?: string | null;
  stream?: string | null;
  preview?: string | null;
  itemOrder?: number;
};

function pickDefined<T extends Record<string, any>>(obj: T) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v; // keep nulls to intentionally clear fields
  }
  return out;
}

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function normalizeIncoming(items: IncomingItem[]): IncomingItem[] {
  const seen = new Set<string>();
  const incoming: IncomingItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    if (!raw || typeof raw.id !== "string" || !raw.id.trim()) continue;

    if (seen.has(raw.id)) continue;
    seen.add(raw.id);

    const start = raw.startTime;
    const end = raw.endTime;
    if (start == null || end == null) continue;

    incoming.push({
      id: raw.id,
      title: raw.title ?? "",
      startTime: typeof start === "number" ? start : Number(start),
      endTime: typeof end === "number" ? end : Number(end),
      screenshot: raw.screenshot ?? null,
      stream: raw.stream ?? null,
      preview: raw.preview ?? null,
      itemOrder: typeof raw.itemOrder === "number" ? raw.itemOrder : undefined,
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
    const incomingSet = new Set(incomingIds);

    // Fetch any existing Item rows so we can decide whether to keep timings
    const existingItems = await tx.item.findMany({
      where: { id: { in: incomingIds } },
      select: { id: true, startTime: true, endTime: true },
    });
    const existingItemMap = new Map(existingItems.map((x) => [x.id, x]));

    let upsertedItems = 0;
    let linkedCreated = 0;
    let linkedUpdated = 0;

    for (let index = 0; index < incoming.length; index++) {
      const it = incoming[index];
      const exists = existingItemMap.has(it.id);

      // Only overwrite timings if we're not preserving them OR the item doesn't exist yet
      const shouldWriteTimings = !preserveTimings || !exists;

      const updateData = pickDefined({
        title: it.title,
        startTime: shouldWriteTimings ? it.startTime : undefined,
        endTime: shouldWriteTimings ? it.endTime : undefined,
        screenshot: it.screenshot,
        stream: it.stream,
        preview: it.preview,
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
        },
      });
      upsertedItems++;

      const desiredOrder = it.itemOrder ?? index;
      const link = existingByItemId.get(it.id);

      if (link) {
        if (link.itemOrder !== desiredOrder) {
          await tx.playlistItem.update({
            where: { id: link.id },
            data: { itemOrder: intOrZero(desiredOrder) },
          });
          linkedUpdated++;
        }
      } else {
        const created = await tx.playlistItem.create({
          data: { playlistId, itemId: it.id, itemOrder: intOrZero(desiredOrder) },
          select: { id: true, itemId: true, itemOrder: true },
        });
        existingByItemId.set(created.itemId, created);
        linkedCreated++;
      }
    }

    // Delete links not present anymore
    const toDelete = existingLinks
      .filter((e) => !incomingSet.has(e.itemId))
      .map((e) => e.id);

    let deleted = 0;
    if (toDelete.length) {
      const res = await tx.playlistItem.deleteMany({ where: { id: { in: toDelete } } });
      deleted = res.count;
    }

    return { upsertedItems, linkedCreated, linkedUpdated, deleted };
  });
}

function intOrZero(n: number) {
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// POST /api/playlists/[id]/items  (manual sync OR smart refresh)
export async function POST(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const parts = pathname.split("/").filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) return jsonError(400, "Playlist ID is required in the URL");

  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) return jsonError(404, "Playlist not found");

  let payload: { items?: IncomingItem[]; clear?: boolean; refresh?: boolean; regenerate?: boolean };
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  // Explicit clear request
  if (payload?.clear === true) {
    await prisma.playlistItem.deleteMany({ where: { playlistId } });
    return NextResponse.json(
      { message: "Playlist cleared", upsertedItems: 0, linkedCreated: 0, linkedUpdated: 0, deleted: 0 },
      { status: 200 }
    );
  }

  // Smart/AUTOMATIC refresh (explicit)
  if (payload?.refresh === true || payload?.regenerate === true) {
    try {
      const built = await buildItemsForPlaylist(playlistId);
      const incoming = normalizeIncoming(built ?? []);

      // If nothing to change, succeed with a no-op
      if (incoming.length === 0) {
        const totalLinkedNow = await prisma.playlistItem.count({ where: { playlistId } });
        return NextResponse.json(
          {
            message: "No changes (0 matches for rules)",
            upsertedItems: 0,
            linkedCreated: 0,
            linkedUpdated: 0,
            deleted: 0,
            totalLinkedNow,
          },
          { status: 200 }
        );
      }

      const result = await syncItems(playlistId, incoming, {
        preserveTimings: payload.refresh === true && payload.regenerate !== true, // refresh = keep timings
      });
      const totalLinkedNow = await prisma.playlistItem.count({ where: { playlistId } });

      return NextResponse.json(
        {
          message:
            payload.regenerate
              ? "Playlist regenerated from rules (timings rebuilt)"
              : "Playlist refreshed from rules (timings preserved)",
          ...result,
          totalLinkedNow,
        },
        { status: 200 }
      );
    } catch (e: any) {
      console.error("Refresh error:", e);
      return jsonError(500, e?.message ?? "Failed to refresh from rules");
    }
  }

  // Manual sync with explicit items[]
  if (!Array.isArray(payload.items)) {
    return jsonError(400, "`items` must be an array (or send { refresh: true } to rebuild from rules).");
  }

  const incoming = normalizeIncoming(payload.items);
  if (incoming.length === 0) {
    return jsonError(400, "No valid items provided (nothing was changed).");
  }

  try {
    const result = await syncItems(playlistId, incoming);
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

  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) return jsonError(404, "Playlist not found");

  const playlistItems = await prisma.playlistItem.findMany({
    where: { playlistId },
    orderBy: { itemOrder: "asc" },
    include: { item: true },
  });

  const items = playlistItems.map((pi) => ({
    id: pi.item.id,
    title: pi.item.title,
    startTime: pi.item.startTime,
    endTime: pi.item.endTime,
    screenshot: pi.item.screenshot ?? undefined,
    stream: pi.item.stream ?? undefined,
    preview: pi.item.preview ?? undefined,
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
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  const itemId = body?.itemId;
  if (!itemId) return jsonError(400, "itemId is required");

  try {
    const res = await prisma.playlistItem.deleteMany({ where: { playlistId, itemId } });
    return NextResponse.json({ success: true, removed: res.count }, { status: 200 });
  } catch (error) {
    console.error(error);
    return jsonError(500, "Failed to remove item from playlist", { details: String(error) });
  }
}
