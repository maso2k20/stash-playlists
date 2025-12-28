import { gql } from "@apollo/client";
import { extractRelativePath } from "@/lib/urlUtils";

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
      scene_markers {
        id
        title
        end_seconds
        seconds
        screenshot
        stream
        preview
        scene { id title performers { id name } }
        tags { id name }
      }
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
      scene_markers {
        id
        title
        end_seconds
        seconds
        screenshot
        stream
        preview
        scene { id title performers { id name } }
        tags { id name }
      }
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
      scene_markers {
        id
        title
        end_seconds
        seconds
        screenshot
        stream
        preview
        scene { id title performers { id name } }
        tags { id name }
      }
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
};

// Determine which query to use based on tag configuration
export function getSmartPlaylistQuery(rules: SmartRules) {
  // Don't fall back to tagIds here - that contains ALL tags for legacy compat
  const requiredTagIds = rules.requiredTagIds ?? [];
  const optionalTagIds = rules.optionalTagIds ?? [];

  if (requiredTagIds.length && optionalTagIds.length) {
    // Both required and optional - query with required, filter optional client-side
    return SMART_PLAYLIST_BUILDER_COMBINED;
  } else if (optionalTagIds.length) {
    // Only optional tags - use INCLUDES (OR logic)
    return SMART_PLAYLIST_BUILDER_OPTIONAL;
  } else if (requiredTagIds.length) {
    // Only required tags - use INCLUDES_ALL (AND logic)
    return SMART_PLAYLIST_BUILDER_REQUIRED;
  } else if (rules.tagIds?.length) {
    // Legacy format - treat as required
    return SMART_PLAYLIST_BUILDER_REQUIRED;
  } else {
    // No tags at all
    return SMART_PLAYLIST_BUILDER_REQUIRED;
  }
}

// Build vars for the query
export function buildSmartVars(rules: SmartRules) {
  // Don't fall back to tagIds here - that contains ALL tags for legacy compat
  const requiredTagIds = rules.requiredTagIds ?? [];
  const optionalTagIds = rules.optionalTagIds ?? [];

  // Determine which tags to use in the query
  let tagIDsForQuery: string[];
  if (requiredTagIds.length && optionalTagIds.length) {
    // Combined mode - query uses required tags, optional filtered client-side
    tagIDsForQuery = requiredTagIds;
  } else if (optionalTagIds.length) {
    // Only optional - query uses optional tags with INCLUDES
    tagIDsForQuery = optionalTagIds;
  } else if (requiredTagIds.length) {
    // Only required - use required tags
    tagIDsForQuery = requiredTagIds;
  } else {
    // Legacy format fallback
    tagIDsForQuery = rules.tagIds ?? [];
  }

  return {
    actorId: (rules.actorIds ?? []).map(String),
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
  prisma: any
): Promise<any[]> {
  if (!minRating || minRating < 1) {
    return items;
  }

  // Get all item IDs
  const itemIds = items.map(item => item.id);

  // Fetch ratings from database
  const itemsWithRatings = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      rating: { gte: minRating }
    },
    select: { id: true }
  });

  const ratedItemIds = new Set(itemsWithRatings.map((item: { id: string }) => item.id));

  // Filter items to only include those with sufficient rating
  return items.filter(item => ratedItemIds.has(item.id));
}
