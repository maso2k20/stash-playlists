import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  const settings = await prisma.settings.findMany();
  return NextResponse.json(settings, { status: 200 });
}