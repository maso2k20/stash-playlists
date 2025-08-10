import { prisma } from "@/lib/prisma";

export type StashConfig = {
  serverUrl: string;   // e.g. http://192.168.1.17:6969
  graphqlUrl: string;  // e.g. http://192.168.1.17:6969/graphql
  apiKey: string;      // raw key
};

function ensureProtocol(url: string): string {
  // If user saved "192.168.1.17:6969" or "localhost:6969", assume http
  if (/^https?:\/\//i.test(url)) return url;
  return `http://${url}`;
}

function joinUrl(base: string, suffix: string): string {
  // join without double slashes
  const b = base.replace(/\/+$/, "");
  const s = suffix.replace(/^\/+/, "");
  return `${b}/${s}`;
}

function normalizeServerUrl(value: string | null | undefined): string {
  const raw = (value || "").trim();
  if (!raw) throw new Error("STASH_SERVER is missing in Settings");
  const withProto = ensureProtocol(raw);
  try {
    // Validate
    const u = new URL(withProto);
    return u.toString().replace(/\/+$/, ""); // strip trailing slash
  } catch {
    throw new Error(`STASH_SERVER is not a valid URL: "${raw}"`);
  }
}

export async function getStashConfig(): Promise<StashConfig> {
  // Adjust table/columns if yours differ
  const rows = await prisma.settings.findMany({
    where: { key: { in: ["STASH_SERVER", "STASH_API"] } },
    select: { key: true, value: true },
  });

  const map = Object.fromEntries(rows.map(r => [r.key, (r.value ?? "").toString().trim()]));

  const serverUrl = normalizeServerUrl(map.STASH_SERVER);
  const graphqlUrl = joinUrl(serverUrl, "graphql");
  const apiKey = map.STASH_API || "";

  if (!apiKey) throw new Error("STASH_API is missing in Settings");

  return { serverUrl, graphqlUrl, apiKey };
}
