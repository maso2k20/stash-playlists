import { gql } from "@apollo/client";
import { extractRelativePath } from "@/lib/urlUtils";

const MARKER_FIELDS = `
  id
  title
  end_seconds
  seconds
  screenshot
  stream
  preview
  scene { id title performers { id name } }
  tags { id name }
`;

// No tag filter — used when no tags are selected (avoids INCLUDES_ALL: [] returning only untagged markers)
export const SMART_PLAYLIST_BUILDER_NO_TAGS = gql`
  query smartPlaylistBuilderNoTags($actorId: [ID!]) {
    findSceneMarkers(
      filter: { per_page: 5000 }
      scene_marker_filter: {
        performers: { modifier: INCLUDES_ALL, value: $actorId }
      }
    ) {
      scene_markers { ${MARKER_FIELDS} }
    }
  }
`;

// Query for INCLUDES_ALL (required tags only)
export const SMART_PLAYLIST_BUILDER_REQUIRED = gql`
  query smartPlaylistBuilderRequired($actorId: [ID!], $tagID: [ID!]!) {
    findSceneMarkers(
      filter: { per_page: 5000 }
      scene_marker_filter: {
        performers: { modifier: INCLUDES_ALL, value: $actorId }
        tags: { modifier: INCLUDES_ALL, value: $tagID }
      }
    ) {
      scene_markers { ${MARKER_FIELDS} }
    }
  }
`;

// Query for INCLUDES (optional tags only)
export const SMART_PLAYLIST_BUILDER_OPTIONAL = gql`
  query smartPlaylistBuilderOptional($actorId: [ID!], $tagID: [ID!]!) {
    findSceneMarkers(
      filter: { per_page: 5000 }
      scene_marker_filter: {
        performers: { modifier: INCLUDES_ALL, value: $actorId }
        tags: { modifier: INCLUDES, value: $tagID }
      }
    ) {
      scene_markers { ${MARKER_FIELDS} }
    }
  }
`;

// Query for combined (required + optional) - queries required, includes tags for client-side filtering
export const SMART_PLAYLIST_BUILDER_COMBINED = gql`
  query smartPlaylistBuilderCombined($actorId: [ID!], $tagID: [ID!]!) {
    findSceneMarkers(
      filter: { per_page: 5000 }
      scene_marker_filter: {
        performers: { modifier: INCLUDES_ALL, value: $actorId }
        tags: { modifier: INCLUDES_ALL, value: $tagID }
      }
    ) {
      scene_markers { ${MARKER_FIELDS} }
    }
  }
`;

// Legacy query alias for backward compatibility
export const SMART_PLAYLIST_BUILDER = SMART_PLAYLIST_BUILDER_REQUIRED;

export type SmartRules = {
  actorIds: string[];
  tagIds?: string[];           // Legacy format
  requiredTagIds?: string[];   // ALL must match
  optionalTagIds?: string[];   // ANY must match
  minRating?: number | null;
  exactRating?: number | null;
};

// Build a GraphQL query document dynamically so filter clauses are only
// included when the corresponding arrays are non-empty. Sending
// INCLUDES_ALL: [] to Stash returns only untagged/no-performer markers,
// not all markers — so we must omit the clause entirely when not needed.
export function getSmartPlaylistQuery(rules: SmartRules) {
  const actorIds   = (rules.actorIds   ?? []).map(String);
  const requiredTagIds = (rules.requiredTagIds ?? []).map(String);
  const optionalTagIds = (rules.optionalTagIds ?? []).map(String);
  const legacyTagIds   = (rules.tagIds ?? []).map(String);

  const hasBoth        = requiredTagIds.length > 0 && optionalTagIds.length > 0;
  const hasRequiredOnly = requiredTagIds.length > 0 && optionalTagIds.length === 0;
  const hasOptionalOnly = requiredTagIds.length === 0 && optionalTagIds.length > 0;
  const hasLegacyOnly   = requiredTagIds.length === 0 && optionalTagIds.length === 0 && legacyTagIds.length > 0;

  const filterParts: string[] = [];
  const varDecls: string[] = [];

  if (actorIds.length) {
    filterParts.push('performers: { modifier: INCLUDES_ALL, value: $actorId }');
    varDecls.push('$actorId: [ID!]');
  }

  if (hasBoth || hasRequiredOnly || hasLegacyOnly) {
    filterParts.push('tags: { modifier: INCLUDES_ALL, value: $tagID }');
    varDecls.push('$tagID: [ID!]');
  } else if (hasOptionalOnly) {
    filterParts.push('tags: { modifier: INCLUDES, value: $tagID }');
    varDecls.push('$tagID: [ID!]');
  }

  const varString    = varDecls.length ? `(${varDecls.join(', ')})` : '';
  const filterClause = filterParts.length
    ? `scene_marker_filter: { ${filterParts.join(' ')} }`
    : '';

  return gql(`
    query smartPlaylistPreview${varString} {
      findSceneMarkers(
        filter: { per_page: 5000 }
        ${filterClause}
      ) {
        scene_markers {
          id title end_seconds seconds screenshot stream preview
          scene { id title performers { id name } }
          tags { id name }
        }
      }
    }
  `);
}

// Build variables to match the dynamically-generated query.
// Only include a variable when its filter clause is actually in the query.
export function buildSmartVars(rules: SmartRules) {
  const actorIds       = (rules.actorIds   ?? []).map(String);
  const requiredTagIds = (rules.requiredTagIds ?? []).map(String);
  const optionalTagIds = (rules.optionalTagIds ?? []).map(String);
  const legacyTagIds   = (rules.tagIds ?? []).map(String);

  const vars: Record<string, any> = {};

  if (actorIds.length) vars.actorId = actorIds;

  const hasBoth = requiredTagIds.length > 0 && optionalTagIds.length > 0;
  if (hasBoth) {
    vars.tagID = requiredTagIds;           // optional tags filtered client-side
  } else if (optionalTagIds.length) {
    vars.tagID = optionalTagIds;
  } else if (requiredTagIds.length) {
    vars.tagID = requiredTagIds;
  } else if (legacyTagIds.length) {
    vars.tagID = legacyTagIds;
  }
  // (no vars when both arrays are empty — query has no filter clauses)

  return vars;
}

// Filter markers by optional tags (client-side filtering)
export function filterByOptionalTags(markers: any[], optionalTagIds: string[]): any[] {
  if (!optionalTagIds?.length) return markers;

  const optionalTagSet = new Set(optionalTagIds.map(String));
  return (markers ?? []).filter((marker: any) => {
    const markerTagIds = (marker.tags ?? []).map((t: any) => String(t.id));
    return markerTagIds.some((tagId: string) => optionalTagSet.has(tagId));
  });
}

// Map Stash markers → your items payload shape
export function mapMarkersToItems(markers: any[], opts: {
  stashServer?: string | null;
  stashAPI?: string | null;
}) {
  return (markers ?? []).map((m: any, index: number) => ({
    id: String(m.id),
    title: m.title ?? "",
    startTime: Number(m.seconds ?? 0),
    endTime: Number(m.end_seconds ?? 0),
    // Store relative paths only - full URLs built at runtime
    screenshot: m.scene?.id ? `/scene/${m.scene.id}/screenshot` : extractRelativePath(m.screenshot),
    stream: m.scene?.id ? `/scene/${m.scene.id}/stream` : extractRelativePath(m.stream),
    preview: extractRelativePath(m.preview ?? m.screenshot),
    sceneId: m.scene?.id ?? null, // Add scene ID for maintenance tracking
    itemOrder: index,
  }));
}

// Filter items by rating (to be used after fetching from database)
export async function filterItemsByRating(
  items: any[],
  minRating: number | null,
  exactRating: number | null,
  prisma: any
): Promise<any[]> {
  const hasExact = exactRating && [1, 2, 3].includes(exactRating);
  const hasMin = minRating && [1, 2, 3].includes(minRating);
  if (!hasExact && !hasMin) {
    return items;
  }

  const itemIds = items.map(item => item.id);
  const ratingWhere = hasExact ? { equals: exactRating! } : { gte: minRating! };

  const itemsWithRatings = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      rating: ratingWhere,
    },
    select: { id: true }
  });

  const ratedItemIds = new Set(itemsWithRatings.map((item: { id: string }) => item.id));

  return items.filter(item => ratedItemIds.has(item.id));
}
