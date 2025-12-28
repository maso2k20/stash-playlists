// src/app/api/templates/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/templates/[id] - Get a single template
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const template = await prisma.playlistTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json(template, { status: 200 });
  } catch (error) {
    console.error('Failed to fetch template:', error);
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
  }
}

// PUT /api/templates/[id] - Update a template
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const data = await request.json();
    const { name, tagIds } = data;

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return NextResponse.json({ error: 'Template name cannot be empty' }, { status: 400 });
    }

    if (tagIds !== undefined && (!Array.isArray(tagIds) || tagIds.length === 0)) {
      return NextResponse.json({ error: 'At least one tag is required' }, { status: 400 });
    }

    const updateData: { name?: string; tagIds?: string[] } = {};
    if (name) updateData.name = name.trim();
    if (tagIds) updateData.tagIds = tagIds;

    const template = await prisma.playlistTemplate.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(template, { status: 200 });
  } catch (error) {
    console.error('Failed to update template:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

// DELETE /api/templates/[id] - Delete a template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await prisma.playlistTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Failed to delete template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
