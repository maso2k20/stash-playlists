// src/app/api/tags/selection/route.ts
//
// Which Stash tags the user has reviewed / enabled for the tag editors.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/tags/selection → { enabled: string[], reviewed: string[] }
// `reviewed` is every tag with a row (enabled or not); tags missing from it are "new".
export async function GET() {
  const rows = await prisma.tagSelection.findMany({ select: { id: true, enabled: true } });
  return NextResponse.json({
    enabled: rows.filter((r) => r.enabled).map((r) => r.id),
    reviewed: rows.map((r) => r.id),
  });
}

// POST /api/tags/selection
// Body: { action: "set", ids: string[], enabled: boolean }  — enable/disable tags
//       { action: "markReviewed", ids: string[] }           — record tags as seen
//                                                              without changing any
//                                                              that are already enabled
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const action = body?.action;
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];

  if (!ids.length || (action !== 'set' && action !== 'markReviewed')) {
    return NextResponse.json(
      { error: 'Expected { action: "set" | "markReviewed", ids: string[] }' },
      { status: 400 }
    );
  }
  if (action === 'set' && typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: '"set" requires enabled: boolean' }, { status: 400 });
  }

  // Chunked so marking a few thousand tags reviewed stays a handful of transactions.
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((id) =>
        action === 'set'
          ? prisma.tagSelection.upsert({
              where: { id },
              create: { id, enabled: body.enabled },
              update: { enabled: body.enabled },
            })
          : prisma.tagSelection.upsert({
              where: { id },
              create: { id, enabled: false },
              update: {},
            })
      )
    );
  }

  return NextResponse.json({ success: true, count: ids.length });
}
