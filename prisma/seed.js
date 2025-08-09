// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Adjust keys/table/fields to match your schema.
  // This assumes a model named `Settings` with a unique `key` column.
  const defaults = [
    { key: 'STASH_API', value: process.env.STASH_GRAPHQL_URL || '' },
    { key: 'STASH_SERVER',     value: process.env.STASH_API_KEY || 'http://stash:9999/graphql' },
    { key: 'THEME_MODE', value: 'light' },
  ];

  for (const s of defaults) {
    await prisma.settings.upsert({
      where: { key: s.key },          // requires @unique or @id on `key`
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
