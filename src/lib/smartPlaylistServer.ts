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

export type SmartPlaylistConditions = {
  actorIds?: string[];
  tagIds?: string[];           // Legacy format (treated as requiredTagIds for backward compat)
  requiredTagIds?: string[];   // ALL must match (INCLUDES_ALL)
  optionalTagIds?: string[];   // ANY must match (INCLUDES)
  minRating?: number | null;
  exactRating?: number | null;
  perPage?: number;
  clip?: { before?: number; after?: number };
};

// Marker shape returned by fetchFilteredStashMarkers — includes everything
// the editor preview needs to render (performers, tag names, etc.).
export type StashMarker = {
  id: string;
  title?: string | null;
  seconds: number;
  end_seconds?: number | null;
  screenshot?: string | null;
  stream?: string | null;
  preview?: string | null;
  scene: {
    id: string;
    title?: string | null;
    performers?: Array<{ id: string; name: string }>;
  } | null;
  tags?: Array<{ id: string; name: string }>;
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

// Remap any pre-migration star values (1-5) to the new 3-level scale
// so playlists saved before the migration still filter correctly.
function remapLegacyRating(v: number | null | undefined): number | null {
  if (v == null || v < 1) return null;
  if (v <= 3) return v;          // already on new scale
  if (v >= 5) return 3;          // 5 stars → Love
  if (v >= 4) return 2;          // 4 stars → Like
  return 1;
}

// Normalize raw conditions into the shape the rest of the pipeline expects.
// Extracted so both fetchFilteredStashMarkers and the preview endpoint
// can re-use the same legacy-format and rating-remap logic.
function normalizeConditions(conditions: SmartPlaylistConditions) {
  const actorIds = Array.isArray(conditions.actorIds) ? conditions.actorIds.map(String) : [];
  const legacyTagIds = Array.isArray(conditions.tagIds) ? conditions.tagIds.map(String) : [];
  const requiredTagIds = Array.isArray(conditions.requiredTagIds)
    ? conditions.requiredTagIds.map(String)
    : legacyTagIds; // Fallback to legacy format
  const optionalTagIds = Array.isArray(conditions.optionalTagIds)
    ? conditions.optionalTagIds.map(String)
    : [];
  const minRating = remapLegacyRating(conditions.minRating as any);
  const exactRating = remapLegacyRating(conditions.exactRating as any);
  const perPage = Math.max(1, Number(conditions.perPage ?? 10000));
  return { actorIds, requiredTagIds, optionalTagIds, minRating, exactRating, perPage };
}

type NormalizedConditions = ReturnType<typeof normalizeConditions>;

// Build the Stash GraphQL query string and variable map dynamically.
// Only includes filter clauses for arrays that are non-empty — sending
// INCLUDES_ALL: [] to Stash returns only entities with NO matching
// tags/performers, which is the opposite of "no constraint".
function buildStashMarkerQuery(
  n: Pick<NormalizedConditions, "actorIds" | "requiredTagIds" | "optionalTagIds" | "perPage">,
): { query: string; vars: Record<string, any>; needsOptionalTagFilter: boolean } {
  const { actorIds, requiredTagIds, optionalTagIds, perPage } = n;

  const filterParts: string[] = [];
  const varDecls: string[] = ["$perPage: Int"];
  const vars: Record<string, any> = { perPage };

  if (actorIds.length) {
    filterParts.push(`performers: { modifier: INCLUDES_ALL, value: $actorIds }`);
    varDecls.push("$actorIds: [ID!]");
    vars.actorIds = actorIds;
  }

  // Tag filtering logic:
  // - If only required tags: use INCLUDES_ALL
  // - If only optional tags: use INCLUDES
  // - If both: use INCLUDES_ALL for required, filter optional client-side
  const needsOptionalTagFilter = requiredTagIds.length > 0 && optionalTagIds.length > 0;

  if (requiredTagIds.length && !optionalTagIds.length) {
    filterParts.push(`tags: { modifier: INCLUDES_ALL, value: $requiredTagIds }`);
    varDecls.push("$requiredTagIds: [ID!]");
    vars.requiredTagIds = requiredTagIds;
  } else if (!requiredTagIds.length && optionalTagIds.length) {
    filterParts.push(`tags: { modifier: INCLUDES, value: $optionalTagIds }`);
    varDecls.push("$optionalTagIds: [ID!]");
    vars.optionalTagIds = optionalTagIds;
  } else if (requiredTagIds.length && optionalTagIds.length) {
    filterParts.push(`tags: { modifier: INCLUDES_ALL, value: $requiredTagIds }`);
    varDecls.push("$requiredTagIds: [ID!]");
    vars.requiredTagIds = requiredTagIds;
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
          end_seconds
          screenshot
          stream
          preview
          scene {
            id
            title
            performers { id name }
          }
          tags { id name }
        }
      }
    }
  `;

  return { query, vars, needsOptionalTagFilter };
}

type RawStashMarker = {
  id: string;
  title?: string | null;
  seconds: number;
  end_seconds?: number | null;
  screenshot?: string | null;
  stream?: string | null;
  preview?: string | null;
  scene: {
    id: string;
    title?: string | null;
    performers?: Array<{ id: string; name: string }>;
  } | null;
  tags?: Array<{ id: string; name: string }>;
};

// Rating-only optimization: fetch marker details for a known set of marker IDs
// by querying their scenes from Stash (batched via aliased findScene queries).
// Avoids pulling 10000 unrelated markers when we already know which ones we want.
async function fetchMarkersByItemIds(
  itemIds: string[],
): Promise<RawStashMarker[]> {
  if (itemIds.length === 0) return [];

  // Look up scene IDs from the Item table (cached when items were last synced).
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, sceneId: true },
  });

  const wantedMarkerIds = new Set(itemIds);
  const uniqueSceneIds = Array.from(
    new Set(items.map((i) => i.sceneId).filter((s): s is string => Boolean(s))),
  );
  if (uniqueSceneIds.length === 0) return [];

  // Batch query Stash via aliased findScene(id) queries.
  const BATCH_SIZE = 50;
  const collected: RawStashMarker[] = [];

  for (let i = 0; i < uniqueSceneIds.length; i += BATCH_SIZE) {
    const batch = uniqueSceneIds.slice(i, i + BATCH_SIZE);
    const aliases = batch
      .map((id, idx) =>
        `s${idx}: findScene(id: ${JSON.stringify(id)}) {
          id
          title
          performers { id name }
          scene_markers {
            id
            title
            seconds
            end_seconds
            tags { id name }
          }
        }`,
      )
      .join("\n");
    const query = `query BatchScenes { ${aliases} }`;
    const data = await stashGraph<Record<string, any>>(query, {});

    for (const key of Object.keys(data)) {
      const scene = data[key];
      if (!scene?.scene_markers) continue;
      for (const m of scene.scene_markers) {
        if (!wantedMarkerIds.has(String(m.id))) continue;
        collected.push({
          id: String(m.id),
          title: m.title,
          seconds: Number(m.seconds),
          end_seconds: m.end_seconds == null ? null : Number(m.end_seconds),
          screenshot: null,
          stream: null,
          preview: null,
          scene: {
            id: scene.id,
            title: scene.title,
            performers: scene.performers ?? [],
          },
          tags: m.tags ?? [],
        });
      }
    }
  }

  return collected;
}

// Single source of truth: returns Stash markers matching `conditions`, with
// optional-tag and rating filters applied. Used by both the refresh path
// (via buildItemsForPlaylist) and the editor preview endpoint, guaranteeing
// they return the same result for the same input.
export async function fetchFilteredStashMarkers(
  conditions: SmartPlaylistConditions,
): Promise<StashMarker[]> {
  const n = normalizeConditions(conditions);
  const { actorIds, requiredTagIds, optionalTagIds, minRating, exactRating } = n;

  const hasExactRating = !!exactRating && [1, 2, 3].includes(exactRating);
  const hasMinRating = !!minRating && [1, 2, 3].includes(minRating);
  const hasRatingFilter = hasExactRating || hasMinRating;
  const hasStructuralFilter = actorIds.length > 0 || requiredTagIds.length > 0 || optionalTagIds.length > 0;

  // No filters at all → nothing to do
  if (!hasStructuralFilter && !hasRatingFilter) {
    return [];
  }

  let markers: RawStashMarker[];

  if (!hasStructuralFilter && hasRatingFilter) {
    // Rating-only path: query Item table for rated IDs first, then fetch
    // only those specific markers' details from Stash. This avoids pulling
    // tens of thousands of unrelated markers when only the rated handful
    // matter. Items without a cached sceneId (legacy rows synced before
    // sceneId was added) will be missed — they need to be re-synced via
    // any normal playlist refresh to populate the field.
    const ratingWhere = hasExactRating ? { equals: exactRating! } : { gte: minRating! };
    const ratedItems = await prisma.item.findMany({
      where: { rating: ratingWhere },
      select: { id: true },
    });
    if (ratedItems.length === 0) return [];
    markers = await fetchMarkersByItemIds(ratedItems.map((i) => i.id));
  } else {
    // Structural-filter path: query Stash with the dynamically-built filter
    // clauses, then apply optional-tag and rating filters after the fact.
    const { query, vars, needsOptionalTagFilter } = buildStashMarkerQuery(n);

    type Q = {
      findSceneMarkers: {
        count: number;
        scene_markers: RawStashMarker[];
      };
    };

    const data = await stashGraph<Q>(query, vars);
    markers = data.findSceneMarkers?.scene_markers ?? [];

    // Apply optional-tag client-side filter when both required and optional
    // tags exist (Stash can't combine INCLUDES_ALL + INCLUDES in one query).
    if (needsOptionalTagFilter) {
      const optionalTagSet = new Set(optionalTagIds);
      markers = markers.filter((m) => {
        const markerTagIds = (m.tags ?? []).map((t) => String(t.id));
        return markerTagIds.some((tagId) => optionalTagSet.has(tagId));
      });
    }

    // Apply rating filter against the local Item table. Items not in the
    // Item table (never synced to a playlist) cannot have ratings here,
    // so they're correctly excluded.
    if (hasRatingFilter) {
      const ratingWhere = hasExactRating ? { equals: exactRating! } : { gte: minRating! };
      const itemIds = markers.map((m) => m.id);
      const rated = await prisma.item.findMany({
        where: { id: { in: itemIds }, rating: ratingWhere },
        select: { id: true },
      });
      const ratedSet = new Set(rated.map((r) => r.id));
      markers = markers.filter((m) => ratedSet.has(m.id));
    }
  }

  // Construct relative paths for screenshot/stream/preview that the editor
  // and BuiltItem mapping expect, normalising once at the boundary.
  return markers.map((m) => {
    const sceneId = m.scene?.id ?? undefined;
    const markerId = m.id;
    return {
      ...m,
      screenshot: sceneId ? `/scene/${sceneId}/screenshot` : (m.screenshot ?? null),
      stream: sceneId ? `/scene/${sceneId}/stream` : (m.stream ?? null),
      preview: sceneId && markerId
        ? `/scene/${sceneId}/scene_marker/${markerId}/preview`
        : (m.preview ?? null),
    };
  });
}

// Compute a sensible title from scene+marker titles, deduplicating overlap.
function dedupedTitle(sceneTitleRaw: string, markerTitleRaw: string): string {
  const norm = (s?: string | null) =>
    (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const sNorm = norm(sceneTitleRaw);
  const mNorm = norm(markerTitleRaw);
  let title = sceneTitleRaw || markerTitleRaw || "Marker";
  if (sNorm && mNorm) {
    const areSame = sNorm === mNorm;
    const contains = sNorm.includes(mNorm) || mNorm.includes(sNorm);
    if (!areSame && !contains) {
      title = `${sceneTitleRaw} – ${markerTitleRaw}`;
    } else {
      title = sceneTitleRaw.length >= markerTitleRaw.length ? sceneTitleRaw : markerTitleRaw;
    }
  }
  return title;
}

// Load conditions from DB, fetch matching markers, map to BuiltItem
// shape ready for syncItems. Signature unchanged from before so existing
// callers (refresh route, actor-playlist builders, scheduled refresh)
// do not need to change.
export async function buildItemsForPlaylist(
  playlistId: string,
): Promise<BuiltItem[]> {
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { type: true, conditions: true },
  });
  if (!playlist) throw new Error("Playlist not found");

  const conditions: SmartPlaylistConditions = (playlist.conditions as any) || {};

  // Resolve clip offsets (per-playlist override or DB default)
  const defaultClipSettings = await getDefaultClipSettings();
  const before = Math.max(0, Number(conditions.clip?.before ?? defaultClipSettings.before));
  const after = Math.max(0, Number(conditions.clip?.after ?? defaultClipSettings.after));

  const markers = await fetchFilteredStashMarkers(conditions);

  return markers.map((m, idx) => {
    const markerStart = m.seconds;
    const markerEnd = m.end_seconds ?? (markerStart + 30);
    const start = Math.max(0, Math.floor(markerStart - before));
    const end = Math.max(start + 1, Math.floor(markerEnd + after));

    const sceneId = m.scene?.id ?? undefined;
    const markerId = m.id;
    const title = dedupedTitle(m.scene?.title ?? "", m.title ?? "");

    return {
      id: m.id,
      title,
      startTime: start,
      endTime: end,
      screenshot: m.screenshot ?? (sceneId ? `/scene/${sceneId}/screenshot` : undefined),
      stream: m.stream ?? (sceneId ? `/scene/${sceneId}/stream` : undefined),
      preview: m.preview ?? (sceneId && markerId
        ? `/scene/${sceneId}/scene_marker/${markerId}/preview`
        : undefined),
      sceneId,
      markerId,
      itemOrder: idx,
    };
  });
}
