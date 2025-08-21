import { gql } from "@apollo/client";
import { extractRelativePath } from "@/lib/urlUtils";

export const SMART_PLAYLIST_BUILDER = gql`
  query smartPlaylistBuilder($actorId: [ID!], $tagID: [ID!]!) {
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
        scene { id }
      }
    }
  }
`;

export type SmartRules = { actorIds: string[]; tagIds: string[]; minRating?: number | null };

// Build vars for the query (kept in one place)
export function buildSmartVars(rules: SmartRules) {
  return {
    actorId: (rules.actorIds ?? []).map(String),
    tagID: (rules.tagIds ?? []).map(String),
    minRating: rules.minRating ?? null,
  };
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
