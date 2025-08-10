// app/api/playlists/[id]/items/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function pickDefined<T extends Record<string, any>>(obj: T) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v; // keep nulls so we can intentionally clear fields
  }
  return out;
}

function jsonError(status: number, message: string, extra?: any) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

// POST /api/playlists/[id]/items  (SYNC)
export async function POST(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) return jsonError(400, 'Playlist ID is required in the URL');

  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) return jsonError(404, 'Playlist not found');

  type IncomingItem = {
    id: string;
    title?: string;
    startTime?: number;
    endTime?: number;
    screenshot?: string | null;
    stream?: string | null;
    preview?: string | null;   // <-- NEW
    itemOrder?: number;
  };

  let payload: { items?: IncomingItem[]; clear?: boolean };
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON');
  }

  // Explicit clear request
  if (payload?.clear === true) {
    await prisma.playlistItem.deleteMany({ where: { playlistId } });
    return NextResponse.json({ message: 'Playlist cleared', upsertedItems: 0, linked: 0, deleted: 0 }, { status: 200 });
  }

  if (!Array.isArray(payload.items)) {
    return jsonError(400, '`items` must be an array');
  }

  // Normalize & validate
  const seen = new Set<string>();
  const incoming: IncomingItem[] = [];
  for (let i = 0; i < payload.items.length; i++) {
    const raw = payload.items[i];
    if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) continue;

    // De-duplicate within this payload
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);

    const start = raw.startTime;
    const end = raw.endTime;
    if (start == null || end == null) continue;

    incoming.push({
      id: raw.id,
      title: raw.title ?? '',
      startTime: typeof start === 'number' ? start : Number(start),
      endTime: typeof end === 'number' ? end : Number(end),
      screenshot: raw.screenshot ?? null,
      stream: raw.stream ?? null,
      preview: raw.preview ?? null,              // <-- NEW
      itemOrder: typeof raw.itemOrder === 'number' ? raw.itemOrder : undefined,
    });
  }

  if (incoming.length === 0) {
    // DO NOT clear implicitly — force client to send {clear:true} if they want that.
    return jsonError(400, 'No valid items provided (nothing was changed).');
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Load existing once
      const existingLinks = await tx.playlistItem.findMany({
        where: { playlistId },
        select: { id: true, itemId: true, itemOrder: true },
      });
      const existingByItemId = new Map(existingLinks.map((e) => [e.itemId, e]));

      const incomingIds = incoming.map((i) => i.id);
      const incomingSet = new Set(incomingIds);

      let upsertedItems = 0;
      let linkedCreated = 0;
      let linkedUpdated = 0;

      for (let index = 0; index < incoming.length; index++) {
        const it = incoming[index];

        // Upsert Item (now includes preview)
        const updateData = pickDefined({
          title: it.title,
          startTime: it.startTime,
          endTime: it.endTime,
          screenshot: it.screenshot,
          stream: it.stream,
          preview: it.preview,                   // <-- NEW
        });

        await tx.item.upsert({
          where: { id: it.id },
          update: updateData,
          create: {
            id: it.id,
            title: it.title ?? '',
            startTime: it.startTime ?? 0,
            endTime: it.endTime ?? 0,
            screenshot: it.screenshot ?? null,
            stream: it.stream ?? null,
            preview: it.preview ?? null,         // <-- NEW
          },
        });
        upsertedItems++;

        // Link in playlist with order
        const desiredOrder = it.itemOrder ?? index;
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
            select: { id: true, itemId: true, itemOrder: true },
          });
          existingByItemId.set(created.itemId, created);
          linkedCreated++;
        }
      }

      // Delete links not in incoming set
      const toDelete = existingLinks
        .filter((e) => !incomingSet.has(e.itemId))
        .map((e) => e.id);

      let deleted = 0;
      if (toDelete.length) {
        const res = await tx.playlistItem.deleteMany({
          where: { id: { in: toDelete } },
        });
        deleted = res.count;
      }

      return { upsertedItems, linkedCreated, linkedUpdated, deleted };
    });

    const totalLinkedNow = await prisma.playlistItem.count({ where: { playlistId } });

    return NextResponse.json(
      { message: 'Sync complete', ...result, totalLinkedNow },
      { status: 200 },
    );
  } catch (error: any) {
    let code: string | undefined;
    let meta: any;
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      code = error.code;
      meta = error.meta;
    }
    console.error('Sync error:', error);
    return jsonError(500, 'Failed to sync items to playlist', { code, meta });
  }
}

// GET /api/playlists/[id]/items
export async function GET(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) return jsonError(400, 'Playlist ID is required in the URL');

  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) return jsonError(404, 'Playlist not found');

  const playlistItems = await prisma.playlistItem.findMany({
    where: { playlistId },
    orderBy: { itemOrder: 'asc' },
    include: { item: true },
  });

  const items = playlistItems.map((pi) => ({
    id: pi.item.id,
    title: pi.item.title,
    startTime: pi.item.startTime,
    endTime: pi.item.endTime,
    screenshot: pi.item.screenshot ?? undefined,
    stream: pi.item.stream ?? undefined,
    preview: pi.item.preview ?? undefined,   // <-- NEW (expose to UI)
    itemOrder: pi.itemOrder,
  }));

  return NextResponse.json({ items }, { status: 200 });
}

// DELETE /api/playlists/[id]/items
export async function DELETE(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  const playlistId = parts[2];
  if (!playlistId) return jsonError(400, 'Playlist ID is required in the URL');

  let body: { itemId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON');
  }
  const itemId = body?.itemId;
  if (!itemId) return jsonError(400, 'itemId is required');

  try {
    const res = await prisma.playlistItem.deleteMany({ where: { playlistId, itemId } });
    return NextResponse.json({ success: true, removed: res.count }, { status: 200 });
  } catch (error) {
    console.error(error);
    return jsonError(500, 'Failed to remove item from playlist', { details: String(error) });
  }
}
