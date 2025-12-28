// src/app/api/templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/templates - List all templates
export async function GET() {
  try {
    const templates = await prisma.playlistTemplate.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(templates, { status: 200 });
  } catch (error) {
    console.error('Failed to fetch templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

// POST /api/templates - Create a new template
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { name, tagIds } = data;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }

    if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
      return NextResponse.json({ error: 'At least one tag is required' }, { status: 400 });
    }

    const template = await prisma.playlistTemplate.create({
      data: {
        name: name.trim(),
        tagIds,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Failed to create template:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
