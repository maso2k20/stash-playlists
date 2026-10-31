// src/lib/unorganisedFilter.ts
//
// Builds the Stash SceneFilterType for "unorganised" scenes: scenes with
// markers that lack the "Markers Organised" tag, limited to the app's added
// actors OR added studios (studios always include their sub-studios).
//
// Stash evaluates `{ ...criteria, OR: { ...other } }` as (criteria) OR (other),
// so the shared criteria (has_markers, tag exclusion, optional title) must be
// repeated inside each branch.

type Criteria = Record<string, unknown>;

export function buildUnorganisedSceneFilter(opts: {
  organisedTagId: string;
  actorIds: string[];
  studioIds: string[];
  extra?: Criteria; // additional criteria applied to every branch (e.g. title)
}): Criteria | null {
  const { organisedTagId, actorIds, studioIds, extra = {} } = opts;

  const base: Criteria = {
    has_markers: "true",
    tags: { modifier: "EXCLUDES", value: [organisedTagId] },
    ...extra,
  };

  const branches: Criteria[] = [];
  if (actorIds.length) {
    branches.push({ ...base, performers: { modifier: "INCLUDES", value: actorIds } });
  }
  if (studioIds.length) {
    branches.push({ ...base, studios: { modifier: "INCLUDES", value: studioIds, depth: -1 } });
  }

  // Nothing tracked → no scenes (callers skip the query).
  if (branches.length === 0) return null;
  if (branches.length === 1) return branches[0];
  return { ...branches[0], OR: branches[1] };
}
