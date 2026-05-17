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

// Determine which query to use based on tag configuration
export function getSmartPlaylistQuery(rules: SmartRules) {
  const requiredTagIds = rules.requiredTagIds ?? [];
  const optionalTagIds = rules.optionalTagIds ?? [];
  const legacyTagIds = rules.tagIds ?? [];

  if (requiredTagIds.length && optionalTagIds.length) {
    return SMART_PLAYLIST_BUILDER_COMBINED;
  } else if (optionalTagIds.length) {
    return SMART_PLAYLIST_BUILDER_OPTIONAL;
  } else if (requiredTagIds.length || legacyTagIds.length) {
    return SMART_PLAYLIST_BUILDER_REQUIRED;
  } else {
    // No tags — omit the tags filter entirely so we don't accidentally
    // send INCLUDES_ALL: [] which Stash interprets as "markers with no tags".
    return SMART_PLAYLIST_BUILDER_NO_TAGS;
  }
}

// Build vars for the query
export function buildSmartVars(rules: SmartRules) {
  const requiredTagIds = rules.requiredTagIds ?? [];
  const optionalTagIds = rules.optionalTagIds ?? [];
  const legacyTagIds = rules.tagIds ?? [];

  const actorId = (rules.actorIds ?? []).map(String);

  // When no tags at all, use the no-tags query which has no $tagID variable.
  const noTags = !requiredTagIds.length && !optionalTagIds.length && !legacyTagIds.length;
  if (noTags) {
    return { actorId, minRating: rules.minRating ?? null };
  }

  let tagIDsForQuery: string[];
  if (requiredTagIds.length && optionalTagIds.length) {
    tagIDsForQuery = requiredTagIds;
  } else if (optionalTagIds.length) {
    tagIDsForQuery = optionalTagIds;
  } else if (requiredTagIds.length) {
    tagIDsForQuery = requiredTagIds;
  } else {
    tagIDsForQuery = legacyTagIds;
  }

  return {
    actorId,
    tagID: tagIDsForQuery.map(String),
    minRating: rules.minRating ?? null,
  };
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
