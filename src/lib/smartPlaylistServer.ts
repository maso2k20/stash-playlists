// filepath: src/lib/smartPlaylistServer.ts
import prisma from "@/lib/prisma";
import { getDefaultClipSettings } from "@/lib/settingsDefinitions";

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

  // DB fallback (Settings table)
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
      rows.map((r: { key: string; value: string | null }) => [r.key, r.value || ""]) as any
    );

    dbUrl = map.STASH_GRAPHQL_URL || map.STASH_SERVER || map.STASH_ENDPOINT || "";
    dbKey = map.STASH_API || map.STASH_API_KEY || map.STASH_KEY || "";
  } catch {
    // ignore prisma read errors
  }

  let url = envUrl || dbUrl;
  let apiKey = envKey || dbKey;

  // Detect accidental swap
  const apiKeyLooksLikeUrl = /^https?:\/\//i.test(apiKey);
  const urlLooksLikeToken = looksLikeJWT(url);
  if (urlLooksLikeToken && apiKeyLooksLikeUrl) {
    const tmp = url;
    url = apiKey;
    apiKey = tmp;
  }

  if (!url) {
    throw new Error(
      "Stash URL not configured. Set STASH_SERVER or STASH_GRAPHQL_URL (env or Settings table)."
    );
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Invalid Stash URL: "${url}" (must start with http/https).`);
  }
  // Ensure GraphQL suffix
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
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

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
  actorIds?: string[];
  tagIds?: string[];
  minRating?: number | null;
  perPage?: number;
  clip?: { before?: number; after?: number };
};

type BuiltItem = {
  id: string;
  title?: string;
  startTime: number;
  endTime: number;
  screenshot?: string | null;
  stream?: string | null;
  preview?: string | null;
  itemOrder?: number;
  sceneId?: string;
  markerId?: string;
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

  const conditions: SmartPlaylistConditions = (playlist.conditions as any) || {};
  const actorIds = Array.isArray(conditions.actorIds) ? conditions.actorIds : [];
  const tagIds = Array.isArray(conditions.tagIds) ? conditions.tagIds : [];
  const minRating = conditions.minRating;
  const perPage = Math.max(1, Number(conditions.perPage ?? 5000));
  
  // Get default clip settings from database if not specified in playlist conditions
  const defaultClipSettings = await getDefaultClipSettings();
  const before = Math.max(0, Number(conditions.clip?.before ?? defaultClipSettings.before));
  const after = Math.max(0, Number(conditions.clip?.after ?? defaultClipSettings.after));

  if (!actorIds.length && !tagIds.length) {
    return [];
  }

  // 2) Build query
  const filterParts: string[] = [];
  const varDecls: string[] = ["$perPage: Int"];
  const vars: Record<string, any> = { perPage };

  if (actorIds.length) {
    filterParts.push(`performers: { modifier: INCLUDES_ALL, value: $actorIds }`);
    varDecls.push("$actorIds: [ID!]"); vars.actorIds = actorIds;
  }
  if (tagIds.length) {
    filterParts.push(`tags: { modifier: INCLUDES_ALL, value: $tagIds }`);
    varDecls.push("$tagIds: [ID!]"); vars.tagIds = tagIds;
  }

  const sceneMarkerFilter =
    filterParts.length > 0 ? `scene_marker_filter: { ${filterParts.join("\n")} }` : "";

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
        scene: { id: string; title?: string | null } | null;
      }>;
    };
  };

  const data = await stashGraph<Q>(query, vars);

  const { url, apiKey } = await getStashConfig();
  const baseServer = url.replace(/\/graphql\/?$/i, "");
  const keyParam = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : "";

  const items: BuiltItem[] = (data.findSceneMarkers?.scene_markers ?? []).map(
    (m, idx) => {
      const start = Math.max(0, Math.floor(m.seconds - before));
      const end = Math.max(start + 1, Math.floor(m.seconds + after));

      // --- Deduped title logic ---
      const norm = (s?: string | null) =>
        (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

      const sceneTitleRaw = m.scene?.title ?? "";
      const markerTitleRaw = m.title ?? "";

      const sNorm = norm(sceneTitleRaw);
      const mNorm = norm(markerTitleRaw);

      let title = sceneTitleRaw || markerTitleRaw || "Marker";

      if (sNorm && mNorm) {
        const areSame = sNorm === mNorm;
        const contains = sNorm.includes(mNorm) || mNorm.includes(sNorm);

        if (!areSame && !contains) {
          title = `${sceneTitleRaw} – ${markerTitleRaw}`;
        } else {
          title =
            sceneTitleRaw.length >= markerTitleRaw.length
              ? sceneTitleRaw
              : markerTitleRaw;
        }
      }

      const sceneId = m.scene?.id ?? undefined;
      const markerId = m.id;

      const preview =
        sceneId && markerId
          ? `${baseServer}/scene/${sceneId}/scene_marker/${markerId}/preview${keyParam}`
          : undefined;
      const screenshot = sceneId
        ? `${baseServer}/scene/${sceneId}/screenshot${keyParam}`
        : undefined;
      const stream = sceneId
        ? `${baseServer}/scene/${sceneId}/stream${keyParam}`
        : undefined;

      return {
        id: m.id,
        title,
        startTime: start,
        endTime: end,
        screenshot,
        stream,
        preview,
        sceneId,
        markerId,
        itemOrder: idx,
      };
    }
  );

  // Apply rating filter if specified
  if (minRating && minRating >= 1) {
    const itemIds = items.map(item => item.id);
    
    const itemsWithRatings = await prisma.item.findMany({
      where: {
        id: { in: itemIds },
        rating: { gte: minRating }
      },
      select: { id: true }
    });

    const ratedItemIds = new Set(itemsWithRatings.map(item => item.id));
    return items.filter(item => ratedItemIds.has(item.id));
  }

  return items;
}
