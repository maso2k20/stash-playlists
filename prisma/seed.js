// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function isBlank(v) {
  return v == null || String(v).trim() === '';
}

async function upsertIfMissingOrBlank(key, incomingValue) {
  const trimmed = isBlank(incomingValue) ? '' : String(incomingValue).trim();

  const existing = await prisma.settings.findUnique({ where: { key } });

  if (!existing) {
    if (isBlank(trimmed)) {
      console.log(`↷ [${key}] not in DB and no default provided — leaving unset`);
      return;
    }
    await prisma.settings.create({ data: { key, value: trimmed } });
    console.log(`✓ [${key}] created`);
    return;
  }

  // Only fill if the existing value is blank AND we have a non-blank default
  if (isBlank(existing.value) && !isBlank(trimmed)) {
    await prisma.settings.update({ where: { key }, data: { value: trimmed } });
    console.log(`✓ [${key}] was blank → filled from default`);
  } else {
    console.log(`• [${key}] already set — leaving as-is`);
  }
}

function normalizeServer(url) {
  if (isBlank(url)) return '';
  let u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  // strip trailing slash
  u = u.replace(/\/+$/, '');
  return u;
}

async function main() {
  // Use env defaults only on first/blank; never overwrite non-empty DB values.
  const envServer = normalizeServer(process.env.STASH_SERVER || '');
  const envApi    = (process.env.STASH_API || '').trim();

  await upsertIfMissingOrBlank('STASH_SERVER', envServer);
  await upsertIfMissingOrBlank('STASH_API', envApi);

  // Add any other app defaults the same way:
  // await upsertIfMissingOrBlank('SOME_OTHER_KEY', process.env.SOME_OTHER_KEY);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
