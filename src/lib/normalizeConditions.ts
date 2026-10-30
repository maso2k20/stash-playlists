// src/lib/normalizeConditions.ts
//
// Single source of truth for parsing a Playlist.conditions JSON blob into
// the normalised shape both the list and per-id playlist API routes return.

export type ParsedConditions = {
  actorIds: string[];
  tagIds: string[];
  requiredTagIds: string[];
  optionalTagIds: string[];
  studioIds: string[];
  includeSubStudios: boolean;
  minRating: number | null;
  exactRating: number | null;
  playCountMode: "atLeast" | "atMost" | null;
  playCountValue: number | null;
};

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export function parseRawConditions(raw: unknown): any {
  if (typeof raw === "string") return safeParse(raw);
  return raw ?? {};
}

export function normalizeConditions(raw: unknown): ParsedConditions {
  const c: any = parseRawConditions(raw);
  return {
    actorIds: Array.isArray(c?.actorIds) ? c.actorIds.map(String) : [],
    tagIds: Array.isArray(c?.tagIds) ? c.tagIds.map(String) : [],
    requiredTagIds: Array.isArray(c?.requiredTagIds) ? c.requiredTagIds.map(String) : [],
    optionalTagIds: Array.isArray(c?.optionalTagIds) ? c.optionalTagIds.map(String) : [],
    studioIds: Array.isArray(c?.studioIds) ? c.studioIds.map(String) : [],
    includeSubStudios: c?.includeSubStudios !== false,
    minRating: typeof c?.minRating === "number" ? c.minRating : null,
    exactRating: typeof c?.exactRating === "number" ? c.exactRating : null,
    playCountMode: c?.playCountMode === "atLeast" || c?.playCountMode === "atMost" ? c.playCountMode : null,
    playCountValue: typeof c?.playCountValue === "number" ? c.playCountValue : null,
  };
}
