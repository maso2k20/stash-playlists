// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Creates the setting if missing; never overwrites an existing value
async function ensureSetting(key, value) {
  const existing = await prisma.settings.findUnique({ where: { key } });
  if (!existing) {
    await prisma.settings.create({ data: { key, value } });
    console.log(`Seed: created ${key}=${value}`);
  } else {
    console.log(`Seed: kept existing ${key}=${existing.value}`);
  }
}

async function main() {
  // Corrected mapping:
  // - STASH_SERVER = GraphQL URL (from STASH_GRAPHQL_URL env)
  // - STASH_API    = API key (from STASH_API_KEY env)
  await ensureSetting('STASH_SERVER', process.env.STASH_SERVER || 'http://stash:9999/graphql');
  await ensureSetting('STASH_API',    process.env.STASH_API_KEY     || '');

  // UI default; don’t overwrite user changes
  await ensureSetting('THEME_MODE', 'light');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
