// filepath: src/lib/smartPlaylistServer.ts
import prisma from "@/lib/prisma";

type StashConfig = { url: string; apiKey?: string };

function looksLikeJWT(s: string) {
  return /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(s);
}

async function getStashConfig(): Promise<StashConfig> {
  // ENV first
  const envUrl =
    (process.env.STASH_GRAPHQL_URL ||
      process.env.STASH_SERVER ||
      process.env.STASH_ENDPOINT ||
      "").trim();

  const envKey =
    (process.env.STASH_API ||
      process.env.STASH_API_KEY ||
      process.env.STASH_KEY ||
      "").trim();

  // DB fallback (your schema uses STASH_SERVER + STASH_API)
  let dbUrl = "";
  let dbKey = "";

  try {
    const rows =
      (await prisma.settings.findMany({
        where: {
          key: {
            in: [
              "STASH_GRAPHQL_URL",
              "STASH_SERVER",
              "STASH_ENDPOINT",
              "STASH_API",
              "STASH_API_KEY",
              "STASH_KEY",
            ],
          },
        },
        select: { key: true, value: true },
      })) || [];

    const map = Object.fromEntries(
      rows.map((r: { key: string; value: string | null }) => [
        r.key,
        (r.value ?? "").trim(),
      ])
    );

    dbUrl =
      map.STASH_GRAPHQL_URL || map.STASH_SERVER || map.STASH_ENDPOINT || "";

    dbKey = map.STASH_API || map.STASH_API_KEY || map.STASH_KEY || "";
  } catch {
    // ignore prisma read errors
  }

  let url = envUrl || dbUrl;
  let apiKey = envKey || dbKey;

  if (!url) {
    throw new Error(
      "Stash URL not configured. Set STASH_SERVER or STASH_GRAPHQL_URL (env or Settings table)."
    );
  }

  // Detect accidental swap
  const apiKeyLooksLikeUrl = /^https?:\/\//i.test(apiKey);
  const urlLooksLikeToken = looksLikeJWT(url);
  if (urlLooksLikeToken && apiKeyLooksLikeUrl) {
    const tmp = url;
    url = apiKey;
    apiKey = tmp;
  }

  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Invalid Stash URL: "${url}" (must start with http/https).`);
  }

  // Normalize: ensure /graphql
  if (!/\/graphql\/?$/i.test(url)) {
    url = url.replace(/\/+$/g, "") + "/graphql";
  }

  return { url, apiKey };
}

export async function stashGraph<T>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const { url, apiKey } = await getStashConfig();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["ApiKey"] = apiKey;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stash GraphQL ${res.status} ${res.statusText}: ${text}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Stash GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data as T;
}

// ---------- SMART PLAYLIST BUILDER ----------

type SmartPlaylistConditions = {
  actorIds?: string[];     // performer IDs
  tagIds?: string[];       // marker tags
  perPage?: number;        // default 1000
  clip?: { before?: number; after?: number }; // seconds around marker
};

type BuiltItem = {
  id: string;                 // use marker id as stable Item.id
  title?: string;
  startTime: number;
  endTime: number;
  screenshot?: string | null;
  stream?: string | null;
  preview?: string | null;
  itemOrder?: number;
};

export async function buildItemsForPlaylist(
  playlistId: string
): Promise<BuiltItem[]> {
  // 1) Load playlist + conditions
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { type: true, conditions: true },
  });

  if (!playlist) throw new Error("Playlist not found");

  const conditions: SmartPlaylistConditions =
    (playlist.conditions as any) || {};

  const actorIds = Array.isArray(conditions.actorIds)
    ? conditions.actorIds
    : [];
  const tagIds = Array.isArray(conditions.tagIds) ? conditions.tagIds : [];

  const perPage =
    typeof conditions.perPage === "number" && conditions.perPage > 0
      ? conditions.perPage
      : 1000;

  const before = Math.max(0, Number(conditions.clip?.before ?? 3)); // default -3s
  const after = Math.max(1, Number(conditions.clip?.after ?? 27));  // default +27s

  if (!actorIds.length && !tagIds.length) {
    // No rules → nothing to build
    return [];
  }

    // 2) Build query text & variable declarations only for used filters
  const filterParts: string[] = [];
  const varDecls: string[] = ["$perPage: Int"];
  const vars: Record<string, any> = { perPage };

  if (actorIds.length) {
    filterParts.push(`performers: { modifier: INCLUDES_ALL, value: $actorIds }`);
    varDecls.push("$actorIds: [ID!]");
    vars.actorIds = actorIds;
  }
  if (tagIds.length) {
    filterParts.push(`tags: { modifier: INCLUDES, value: $tagIds }`);
    varDecls.push("$tagIds: [ID!]");
    vars.tagIds = tagIds;
  }

  const sceneMarkerFilter =
    filterParts.length > 0
      ? `scene_marker_filter: { ${filterParts.join("\n")} }`
      : "";

  const query = `
    query BuildMarkers(${varDecls.join(", ")}) {
      findSceneMarkers(
        filter: { per_page: $perPage }
        ${sceneMarkerFilter}
      ) {
        count
        scene_markers {
          id
          title
          seconds
          scene { id title }
        }
      }
    }
  `;

  type Q = {
    findSceneMarkers: {
      count: number;
      scene_markers: Array<{
        id: string;
        title?: string | null;
        seconds: number;
        scene: { id: string; title?: string | null };
      }>;
    };
  };

  const data = await stashGraph<Q>(query, vars);


  const { url, apiKey } = await getStashConfig();
  // Base server URL for preview/screenshot endpoints
  const baseServer = url.replace(/\/graphql\/?$/i, "");

  const items: BuiltItem[] = (data.findSceneMarkers?.scene_markers ?? []).map(
    (m, idx) => {
      const start = Math.max(0, Math.floor(m.seconds - before));
      const end = Math.max(start + 1, Math.floor(m.seconds + after));

      const titleParts = [];
      if (m.scene?.title) titleParts.push(m.scene.title);
      if (m.title) titleParts.push(m.title);
      const title = titleParts.join(" – ") || "Marker";

      // Stash preview endpoint for markers:
      // /scene/{sceneId}/scene_marker/{markerId}/preview?api_key=TOKEN
      const preview =
        apiKey && m.scene?.id && m.id
          ? `${baseServer}/scene/${m.scene.id}/scene_marker/${m.id}/preview?api_key=${encodeURIComponent(
              apiKey
            )}`
          : null;

      return {
        id: m.id,
        title,
        startTime: start,
        endTime: end,
        screenshot: null, // optional; add if you have a reliable path field
        stream: null,     // your player can derive stream from scene + times if needed
        preview,
        itemOrder: idx,
      };
    }
  );

  return items;
}
