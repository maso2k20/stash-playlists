// src/lib/studioCountService.ts
//
// Refreshes the precomputed marker / unorganised-scene counts for added
// studios. Mirrors actorMarkerCountService but without a cron schedule: the
// Studios page triggers a refresh on load. Counts include sub-studios.
import prisma from "@/lib/prisma";
import { stashGraph } from "@/lib/smartPlaylistServer";

// Aliased COUNT queries bundled per GraphQL request.
const BATCH_SIZE = 50;

let isRunning = false;

export async function refreshStudioCounts(): Promise<{ studiosUpdated: number; errors: string[] }> {
  if (isRunning) return { studiosUpdated: 0, errors: ["Studio count refresh already running"] };
  isRunning = true;

  try {
    const studios = await prisma.studio.findMany({ select: { id: true, name: true } });
    if (studios.length === 0) return { studiosUpdated: 0, errors: [] };

    const errors: string[] = [];
    const organisedTagId = await getMarkersOrganisedTagId();
    if (!organisedTagId) {
      errors.push('"Markers Organised" tag not found in Stash; unorganised scene counts were not updated.');
    }

    const results: { id: string; markerCount: number; unorganisedCount: number | null }[] = [];

    for (let i = 0; i < studios.length; i += BATCH_SIZE) {
      const batch = studios.slice(i, i + BATCH_SIZE);
      const aliases = batch
        .map((studio, idx) => {
          const studioCrit = `studios: { modifier: INCLUDES, value: [${JSON.stringify(studio.id)}], depth: -1 }`;
          const markerAlias =
            `m${idx}: findSceneMarkers(filter: { per_page: 0 }, ` +
            `scene_marker_filter: { scene_filter: { ${studioCrit} } }) { count }`;
          const unorgAlias = organisedTagId
            ? `u${idx}: findScenes(filter: { per_page: 0 }, ` +
              `scene_filter: { has_markers: "true", ${studioCrit}, ` +
              `tags: { modifier: EXCLUDES, value: [${JSON.stringify(organisedTagId)}] } }) { count }`
            : "";
          return `${markerAlias}\n${unorgAlias}`;
        })
        .join("\n");

      try {
        const data = await stashGraph<Record<string, { count: number } | null>>(
          `query StudioCounts { ${aliases} }`,
          {},
        );
        batch.forEach((studio, idx) => {
          const markerCount = data[`m${idx}`]?.count;
          const unorganisedCount = organisedTagId ? data[`u${idx}`]?.count : null;
          if (typeof markerCount === "number") {
            results.push({
              id: studio.id,
              markerCount,
              unorganisedCount: typeof unorganisedCount === "number" ? unorganisedCount : null,
            });
          } else {
            errors.push(`No count returned for ${studio.name} (${studio.id})`);
          }
        });
      } catch (error) {
        errors.push(`Batch starting at ${i} failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    const updatedAt = new Date();
    await prisma.$transaction(
      results.map((r) =>
        prisma.studio.update({
          where: { id: r.id },
          data: {
            markerCount: r.markerCount,
            ...(r.unorganisedCount != null ? { unorganisedSceneCount: r.unorganisedCount } : {}),
            countsUpdatedAt: updatedAt,
          },
        }),
      ),
    );

    return { studiosUpdated: results.length, errors };
  } finally {
    isRunning = false;
  }
}

async function getMarkersOrganisedTagId(): Promise<string | null> {
  try {
    const data = await stashGraph<{ findTags: { tags: { id: string; name: string }[] } }>(
      `query { findTags(tag_filter: { name: { value: "Markers Organised", modifier: EQUALS } }, filter: { per_page: 1 }) { tags { id name } } }`,
      {},
    );
    const tags = data?.findTags?.tags ?? [];
    const tag = tags.find((t) => t.name === "Markers Organised") ?? tags[0];
    return tag?.id ? String(tag.id) : null;
  } catch {
    return null;
  }
}
