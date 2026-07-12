// src/app/unorganised/page.tsx
"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useQuery, gql } from "@apollo/client";
import { useSettings } from "@/app/context/SettingsContext";
import { useStashTags } from "@/context/StashTagsContext";
import { makeStashUrl } from "@/lib/urlUtils";
import Link from "next/link";
import { Search, X } from "lucide-react";

// Query for unorganised scenes (scenes with markers but without "Markers Organised" tag)
const GET_UNORGANISED_SCENES = gql`
  query getUnorganisedScenes(
    $markersOrganisedIds: [ID!]!
    $pageNumber: Int!
    $perPage: Int!
  ) {
    findScenes(
      scene_filter: {
        has_markers: "true"
        tags: { modifier: EXCLUDES, value: $markersOrganisedIds }
      }
      filter: { page: $pageNumber, per_page: $perPage }
    ) {
      count
      scenes {
        id
        title
        paths { screenshot }
        performers { id name }
      }
    }
  }
`;

// Query with title filter
const GET_UNORGANISED_SCENES_FILTERED = gql`
  query getUnorganisedScenesFiltered(
    $markersOrganisedIds: [ID!]!
    $titleQuery: String!
  ) {
    findScenes(
      scene_filter: {
        has_markers: "true"
        tags: { modifier: EXCLUDES, value: $markersOrganisedIds }
        title: { value: $titleQuery, modifier: INCLUDES }
      }
      filter: { per_page: -1 }
    ) {
      count
      scenes {
        id
        title
        paths { screenshot }
        performers { id name }
      }
    }
  }
`;

type Scene = {
  id: string;
  title: string;
  paths?: { screenshot?: string };
  performers?: { id: string; name: string }[];
};

/** Mono pagination: PREV · [1] 2 3 · NEXT (active = accent square). */
function PaginationControls({
  pageNumber,
  perPage,
  totalCount,
  onPageChange,
  className = "",
}: {
  pageNumber: number;
  perPage: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const maxPage = Math.ceil(totalCount / perPage);
  const pages = [pageNumber - 2, pageNumber - 1, pageNumber, pageNumber + 1, pageNumber + 2].filter(
    (n) => n >= 1 && n <= maxPage
  );
  return (
    <div className={`flex items-center gap-2 font-mono text-[11px] ${className}`} style={{ color: "var(--con-muted)" }}>
      <button disabled={pageNumber <= 1} onClick={() => onPageChange(pageNumber - 1)}
        style={{ color: pageNumber <= 1 ? "var(--con-faint)" : "var(--accent-cyan)" }}>PREV</button>
      {pages.map((n) => {
        const active = n === pageNumber;
        return (
          <button key={n} onClick={() => onPageChange(n)}
            className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px]"
            style={active
              ? { background: "var(--accent-cyan)", color: "var(--accent-ink)", fontWeight: 500 }
              : { border: "1px solid var(--con-border)" }}>
            {n}
          </button>
        );
      })}
      <button disabled={pageNumber >= maxPage} onClick={() => onPageChange(pageNumber + 1)}
        style={{ color: pageNumber >= maxPage ? "var(--con-faint)" : "var(--accent-cyan)" }}>NEXT</button>
    </div>
  );
}

function SceneCard({ scene, shot }: { scene: Scene; shot: string }) {
  return (
    <Link href={`/scenes/${scene.id}`} className="group relative block aspect-video overflow-hidden rounded-[6px] no-underline"
      style={{ border: "1px solid var(--con-border)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" style={{ background: "var(--well)" }} />

      {/* Needs-organising amber dot (top-left) */}
      <span className="absolute left-[7px] top-[7px] z-10 h-[7px] w-[7px] rounded-full" style={{ background: "var(--rating)" }} />

      {/* Hover overlay: performers (top) + title (bottom) */}
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: "linear-gradient(to top,rgba(8,10,12,0.92) 0%,rgba(8,10,12,0.1) 45%,rgba(8,10,12,0.55) 100%)" }} />
      {scene.performers && scene.performers.length > 0 && (
        <div className="absolute left-[7px] top-[18px] z-10 flex max-w-[calc(100%-14px)] flex-wrap gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {scene.performers.slice(0, 2).map((p) => (
            <span key={p.id} className="rounded-[4px] px-[6px] py-[2px] text-[9px] text-white"
              style={{ background: "rgba(76,179,224,0.25)", border: "1px solid rgba(76,179,224,0.4)" }}>{p.name}</span>
          ))}
          {scene.performers.length > 2 && (
            <span className="rounded-[4px] px-[6px] py-[2px] text-[9px] text-white"
              style={{ background: "rgba(76,179,224,0.25)", border: "1px solid rgba(76,179,224,0.4)" }}>+{scene.performers.length - 2}</span>
          )}
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-2 pb-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold text-white" title={scene.title}>{scene.title}</div>
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="aspect-video animate-pulse rounded-[6px]" style={{ background: "var(--well)", border: "1px solid var(--con-border)" }} />
      ))}
    </div>
  );
}

function UnorganisedContent() {
  const [pageNumber, setPageNumber] = useState(1);
  const perPage = 42;
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  const settings = useSettings();
  const stashServer = settings["STASH_SERVER"];
  const stashAPI = settings["STASH_API"];

  const { stashTags, loading: tagsLoading, error: tagsError } = useStashTags();

  const markersOrganisedTagId = useMemo(() => {
    const tag = stashTags?.find((t: { id: string; name: string }) => t.name === "Markers Organised");
    return tag?.id ? String(tag.id) : null;
  }, [stashTags]);

  const isFiltering = searchTerm.trim().length > 0;

  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pageNumber]);

  useEffect(() => {
    setPageNumber(1);
  }, [searchTerm]);

  const paginatedVariables = useMemo(() => ({
    markersOrganisedIds: markersOrganisedTagId ? [markersOrganisedTagId] : [],
    pageNumber,
    perPage,
  }), [markersOrganisedTagId, pageNumber, perPage]);

  const filteredVariables = useMemo(() => ({
    markersOrganisedIds: markersOrganisedTagId ? [markersOrganisedTagId] : [],
    titleQuery: searchTerm.trim(),
  }), [markersOrganisedTagId, searchTerm]);

  const { data: paginatedData, loading: paginatedLoading, error: paginatedError } = useQuery(GET_UNORGANISED_SCENES, {
    variables: paginatedVariables,
    skip: !markersOrganisedTagId || isFiltering,
    fetchPolicy: "cache-and-network",
  });

  const { data: filteredData, loading: filteredLoading, error: filteredError } = useQuery(GET_UNORGANISED_SCENES_FILTERED, {
    variables: filteredVariables,
    skip: !markersOrganisedTagId || !isFiltering,
    fetchPolicy: "cache-and-network",
  });

  const data = isFiltering ? filteredData : paginatedData;
  const loading = isFiltering ? filteredLoading : paginatedLoading;
  const error = isFiltering ? filteredError : paginatedError;

  const scenes: Scene[] = useMemo(() => data?.findScenes?.scenes || [], [data]);

  useEffect(() => {
    if (data?.findScenes?.count !== undefined) setTotalCount(data.findScenes.count);
  }, [data]);

  const anyLoading = loading || tagsLoading;
  const maxPage = Math.ceil(totalCount / perPage);

  // Tag not found state
  if (!tagsLoading && !markersOrganisedTagId) {
    return (
      <div className="flex min-h-full flex-col px-[26px] pt-[22px]">
        <h2 className="m-0 mb-4 text-[22px] font-semibold tracking-[-0.01em]">Unorganised Scenes</h2>
        <div className="rounded-[7px] p-6 text-center"
          style={{ background: "var(--rating-tint-bg)", border: "1px solid var(--rating-tint-bd)" }}>
          <div className="text-[14px] font-semibold" style={{ color: "var(--rating)" }}>
            &quot;Markers Organised&quot; tag not found in Stash
          </div>
          <div className="mt-1 text-[13px]" style={{ color: "var(--con-muted)" }}>
            Create a tag named &quot;Markers Organised&quot; in your Stash server to enable this feature.
          </div>
        </div>
      </div>
    );
  }

  const countLine = !anyLoading && totalCount > 0
    ? isFiltering
      ? `${totalCount} SCENE${totalCount === 1 ? "" : "S"} MATCHING “${searchTerm.toUpperCase()}”`
      : `PAGE ${pageNumber} OF ${maxPage} · ${totalCount} SCENES NEED ORGANISING`
    : "…";

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-[26px] pt-[22px]">
        <div>
          <h2 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Unorganised Scenes</h2>
          <div className="con-count mt-1" style={{ color: "var(--rating)" }}>{countLine}</div>
        </div>
        <div className="relative w-[250px]">
          <Search size={14} className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2" style={{ color: "var(--con-faint)" }} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="search by title…"
            aria-label="Search scenes"
            className="con-input w-full pl-[33px] pr-[30px]"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} aria-label="Clear search"
              className="absolute right-[10px] top-1/2 -translate-y-1/2" style={{ color: "var(--con-muted)" }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="px-[26px] pb-[26px] pt-[18px]">
        {/* Top pagination */}
        {!anyLoading && !isFiltering && scenes.length > 0 && totalCount > perPage && (
          <PaginationControls className="mb-4 justify-center" pageNumber={pageNumber} perPage={perPage} totalCount={totalCount} onPageChange={setPageNumber} />
        )}

        {anyLoading && <SkeletonGrid />}

        {!anyLoading && (error || tagsError) && (
          <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error?.message || String(tagsError)}</p>
        )}

        {/* Empty states */}
        {!anyLoading && !error && scenes.length === 0 && totalCount === 0 && (
          <div className="rounded-[7px] p-6 text-center" style={{ background: "var(--surface)", border: "1px dashed var(--con-border-strong)" }}>
            {isFiltering ? (
              <>
                <div className="text-[14px] font-semibold">No scenes match “{searchTerm}”</div>
                <button onClick={() => setSearchTerm("")} className="mt-2 text-[13px]" style={{ color: "var(--accent-cyan)" }}>Clear the filter</button>
              </>
            ) : (
              <>
                <div className="text-[14px] font-semibold">There are no unorganised scenes</div>
                <div className="mt-1 text-[13px]" style={{ color: "var(--con-muted)" }}>All scenes with markers have been organised.</div>
              </>
            )}
          </div>
        )}

        {/* Grid */}
        {!anyLoading && scenes.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {scenes.map((scene) => (
              <SceneCard key={scene.id} scene={scene} shot={makeStashUrl(scene.paths?.screenshot, stashServer, stashAPI) || ""} />
            ))}
          </div>
        )}

        {/* Bottom pagination */}
        {!anyLoading && !isFiltering && scenes.length > 0 && totalCount > perPage && (
          <PaginationControls className="mt-5 justify-center" pageNumber={pageNumber} perPage={perPage} totalCount={totalCount} onPageChange={setPageNumber} />
        )}
      </div>
    </div>
  );
}

export default function UnorganisedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full flex-col px-[26px] pt-[22px]">
          <h2 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Unorganised Scenes</h2>
          <div className="mt-5">
            <SkeletonGrid />
          </div>
        </div>
      }
    >
      <UnorganisedContent />
    </Suspense>
  );
}
