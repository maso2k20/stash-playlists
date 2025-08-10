import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function upsertIfEmpty(key: string, value: string) {
  const existing = await prisma.settings.findUnique({ where: { key } });
  if (!existing) {
    await prisma.settings.create({ data: { key, value } });
    return;
  }
  // Do NOT clobber a non-empty value
  if (!existing.value || existing.value.trim() === "") {
    await prisma.settings.update({ where: { key }, data: { value } });
  }
}

async function main() {
  // Optionally pull defaults from env the FIRST time
  const server = process.env.STASH_SERVER ?? "http://192.168.1.17:6969";
  const api    = process.env.STASH_API    ?? ""; // leave blank if not provided

  await upsertIfEmpty("STASH_SERVER", server);
  await upsertIfEmpty("STASH_API", api);
}

main().finally(() => prisma.$disconnect());
