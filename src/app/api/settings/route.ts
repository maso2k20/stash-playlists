// app/api/settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET /api/settings
export async function GET(_req: NextRequest) {
  try {
    const settings = await prisma.settings.findMany({
      orderBy: { key: "asc" },
    });

    return NextResponse.json(settings, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message ?? "Failed to load settings" },
      { status: 500 }
    );
  }
}

// PUT /api/settings
// Body: { updates: [{ key: string, value: string }] }
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.updates)) {
      return NextResponse.json(
        { message: "Invalid payload. Expected { updates: [{ key, value }] }" },
        { status: 400 }
      );
    }

    const updates: Array<{ key: string; value: string }> = body.updates;

    // Basic validation
    for (const u of updates) {
      if (!u || typeof u.key !== "string") {
        return NextResponse.json(
          { message: "Each update requires a string 'key'." },
          { status: 400 }
        );
      }
      if (typeof u.value !== "string") {
        return NextResponse.json(
          { message: `Value for key '${u.key}' must be a string.` },
          { status: 400 }
        );
      }
    }

    // Upsert each key (update if exists, create if missing)
    await prisma.$transaction(
      updates.map(({ key, value }) =>
        prisma.settings.upsert({
          where: { key },                // 'key' is unique in your model
          update: { value },
          create: { key, value },
        })
      )
    );

    // Return fresh list
    const settings = await prisma.settings.findMany({ orderBy: { key: "asc" } });
    return NextResponse.json(settings, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message ?? "Failed to save settings" },
      { status: 500 }
    );
  }
}
