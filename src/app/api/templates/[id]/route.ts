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
    const { name, tagIds, requiredTagIds, optionalTagIds } = data;

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return NextResponse.json({ error: 'Template name cannot be empty' }, { status: 400 });
    }

    // Check for new format fields
    const hasRequiredTags = requiredTagIds && Array.isArray(requiredTagIds) && requiredTagIds.length > 0;
    const hasOptionalTags = optionalTagIds && Array.isArray(optionalTagIds) && optionalTagIds.length > 0;
    const hasLegacyTags = tagIds && Array.isArray(tagIds) && tagIds.length > 0;

    // If any tags are being updated, ensure at least one tag exists
    if ((requiredTagIds !== undefined || optionalTagIds !== undefined || tagIds !== undefined) &&
        !hasRequiredTags && !hasOptionalTags && !hasLegacyTags) {
      return NextResponse.json({ error: 'At least one tag is required' }, { status: 400 });
    }

    const updateData: {
      name?: string;
      tagIds?: string[];
      requiredTagIds?: string[] | null;
      optionalTagIds?: string[] | null;
    } = {};

    if (name) updateData.name = name.trim();

    // Handle tag updates
    if (requiredTagIds !== undefined || optionalTagIds !== undefined) {
      // New format being used
      updateData.requiredTagIds = requiredTagIds ?? null;
      updateData.optionalTagIds = optionalTagIds ?? null;
      // Update legacy tagIds for backward compatibility
      updateData.tagIds = [...(requiredTagIds || []), ...(optionalTagIds || [])];
    } else if (tagIds !== undefined) {
      // Only legacy format provided
      updateData.tagIds = tagIds;
    }

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
