// app/api/settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { SETTINGS_DEFINITIONS, validateSetting } from "@/lib/settingsDefinitions";

const prisma = new PrismaClient();

// GET /api/settings
export async function GET() {
  try {
    // First, ensure all defined settings exist in the database
    await initializeSettings();
    
    const settings = await prisma.settings.findMany({
      orderBy: { key: "asc" },
    });

    return NextResponse.json(settings, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load settings";
    return NextResponse.json(
      { message },
      { status: 500 }
    );
  }
}

// Helper function to initialize missing settings with their defaults
async function initializeSettings() {
  const existingSettings = await prisma.settings.findMany({
    select: { key: true },
  });
  
  const existingKeys = new Set(existingSettings.map(s => s.key));
  const missingSettings = SETTINGS_DEFINITIONS.filter(def => !existingKeys.has(def.key));
  
  if (missingSettings.length > 0) {
    await prisma.$transaction(
      missingSettings.map(def =>
        prisma.settings.create({
          data: {
            key: def.key,
            value: def.defaultValue,
          },
        })
      )
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
      
      // Setting-specific validation
      const validationError = validateSetting(u.key, u.value);
      if (validationError) {
        return NextResponse.json(
          { message: `${u.key}: ${validationError}` },
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to save settings";
    return NextResponse.json(
      { message },
      { status: 500 }
    );
  }
}
