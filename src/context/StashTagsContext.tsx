"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, gql, type ApolloError } from "@apollo/client";

const GET_STASH_TAGS = gql`
  query getStashTags {
    findTags(filter: { per_page: 10000 }) {
      tags {
        id
        name
        scene_count
        image_path
        child_count
        children {
          id
          name
          scene_count
          child_count
        }
      }
    }
  }
`;

type TagSelection = { enabled: string[]; reviewed: string[] };

type StashTagsValue = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stashTags: any[];
  loading: boolean;
  error: ApolloError | undefined;
  refetch: () => Promise<unknown>;
  enabledTagIds: Set<string>;
  reviewedTagIds: Set<string>;
  selectionLoaded: boolean;
  refetchSelection: () => Promise<void>;
  limitToEnabled: <T extends { id: string | number }>(tags: T[], keepIds?: Array<string | number>) => T[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const StashTagsContext = createContext<StashTagsValue>(null as any);

export const StashTagsProvider = ({ children }: { children: React.ReactNode }) => {
  const { data, loading, error, refetch } = useQuery(GET_STASH_TAGS);

  // You can shape the value as needed
  const stashTags = data?.findTags?.tags ?? [];

  // Tags the user has enabled on the Tags page (app DB), used to limit the
  // Other Tags / Common Tags boxes, the player tag editor and the rule builder.
  const [selection, setSelection] = useState<TagSelection | null>(null);
  const refetchSelection = useCallback(async () => {
    try {
      const r = await fetch("/api/tags/selection", { cache: "no-store" });
      if (r.ok) setSelection(await r.json());
    } catch {
      /* leave unfiltered on failure */
    }
  }, []);
  useEffect(() => {
    refetchSelection();
  }, [refetchSelection]);

  const enabledTagIds = useMemo(() => new Set(selection?.enabled ?? []), [selection]);
  const reviewedTagIds = useMemo(() => new Set(selection?.reviewed ?? []), [selection]);

  // Limit a tag list to enabled tags. `keepIds` (e.g. tags already on a marker)
  // always stay so they can still be seen and removed. With nothing enabled yet
  // the list is returned unchanged, so the editors work before any setup.
  const limitToEnabled = useCallback(
    <T extends { id: string | number }>(tags: T[], keepIds: Array<string | number> = []): T[] => {
      if (enabledTagIds.size === 0) return tags;
      const keep = new Set(keepIds.map(String));
      return tags.filter((t) => enabledTagIds.has(String(t.id)) || keep.has(String(t.id)));
    },
    [enabledTagIds]
  );

  return (
    <StashTagsContext.Provider
      value={{
        stashTags,
        loading,
        error,
        refetch,
        enabledTagIds,
        reviewedTagIds,
        selectionLoaded: selection !== null,
        refetchSelection,
        limitToEnabled,
      }}
    >
      {children}
    </StashTagsContext.Provider>
  );
};

export const useStashTags = () => useContext(StashTagsContext);
