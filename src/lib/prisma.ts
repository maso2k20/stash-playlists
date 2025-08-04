import { PrismaClient } from '@prisma/client';

declare global {
  // Prevent multiple instantiations in dev
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: ['query'],  // optional: logs all queries in console
  });

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;
