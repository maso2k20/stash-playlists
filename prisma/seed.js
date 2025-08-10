// prisma/seed.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.settings.upsert({
    where: { key: "STASH_SERVER" },
    update: { value: "http://192.168.1.17:6969" },
    create: { key: "STASH_SERVER", value: "http://192.168.1.17:6969" },
  });
  await prisma.settings.upsert({
    where: { key: "STASH_API" },
    update: { value: "YOUR_API_KEY_HERE" },
    create: { key: "STASH_API", value: "YOUR_API_KEY_HERE" },
  });
}

main().finally(() => prisma.$disconnect());
