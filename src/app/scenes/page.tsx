// src/app/scenes/page.tsx
"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useQuery, gql } from "@apollo/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useSettings } from "@/app/context/SettingsContext";
import { useStashTags } from "@/context/StashTagsContext";
import Link from "next/link";
import { Search, Check, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Paginated query for browsing (fast initial load)
const GET_SCENES_PAGINATED = gql`
  query getScenesPaginated($pageNumber: Int!, $perPage: Int!) {
    findScenes(
      scene_filter: {}
      filter: { page: $pageNumber, per_page: $perPage }
    ) {
      count
      scenes {
        id
        title
        paths { screenshot }
        performers { id name }
        tags { id name }
        rating100
      }
    }
  }
`;

// Filtered query for search/filtering (all results)
const GET_SCENES_FILTERED = gql`
  query getScenesFiltered($title: String!, $performers: [ID!], $tags: [ID!], $rating: Int!) {
    findScenes(
      scene_filter: {
        title: { value: $title, modifier: INCLUDES }
        performers: { value: $performers, modifier: INCLUDES_ALL }
        tags: { value: $tags, modifier: INCLUDES_ALL }
        rating100: { value: $rating, modifier: GREATER_THAN }
      }
      filter: { per_page: -1 }
    ) {
      count
      scenes {
        id
        title
        paths { screenshot }
        performers { id name }
        tags { id name }
        rating100
      }
    }
  }
`;

// Get all performers for filter options
const GET_PERFORMERS = gql`
  query getPerformers {
    findPerformers(filter: { per_page: -1, sort: "name", direction: ASC }) {
      performers { id name }
    }
  }
`;

type Scene = {
  id: string;
  title: string;
  paths?: { screenshot?: string };
  performers?: { id: string; name: string }[];
  tags?: { id: string; name: string }[];
  rating100?: number;
};

type SortOption =
  | "title-asc"
  | "title-desc"
  | "date-desc"
  | "date-asc"
  | "rating-desc"
  | "rating-asc";

type RatingFilter = "all" | "1+" | "2+" | "3+" | "4+" | "5";

const SORT_LABELS: Record<SortOption, string> = {
  "title-asc": "Title (A–Z)",
  "title-desc": "Title (Z–A)",
  "date-desc": "Newest First",
  "date-asc": "Oldest First",
  "rating-desc": "Highest Rated",
  "rating-asc": "Lowest Rated",
};

const RATING_LABELS: Record<RatingFilter, string> = {
  all: "All ratings",
  "1+": "1+ Stars",
  "2+": "2+ Stars",
  "3+": "3+ Stars",
  "4+": "4+ Stars",
  "5": "5 Stars",
};

function joinUrl(base?: string, path?: string) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (!base) return path;
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function withApiKey(url: string, apiKey?: string) {
  if (!url || !apiKey) return url;
  if (/[?&]api_key=/.test(url)) return url;
  return url.includes("?") ? `${url}&api_key=${apiKey}` : `${url}?api_key=${apiKey}`;
}

function getRatingFilterValue(ratingFilter: RatingFilter): number {
  if (ratingFilter === "all") return 0;
  const starValue = parseInt(ratingFilter.replace("+", ""), 10);
  return starValue * 20 - 1;
}

type FilterOption = { id: string; label: string };

/** Multi-select combobox (cmdk) replacing the MUI Autocomplete. Works on option ids. */
function MultiSelect({
  placeholder,
  options,
  selectedIds,
  onChange,
}: {
  placeholder: string;
  options: FilterOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedCount = selectedIds.length;

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-[6px] px-3 py-2 text-left text-[12px]"
          style={{
            background: "var(--well)",
            border: "1px solid var(--con-border)",
            color: selectedCount ? "var(--con-text-2)" : "var(--con-faint)",
          }}
        >
          <span className="truncate">
            {selectedCount ? `${selectedCount} selected` : placeholder}
          </span>
          <ChevronDown size={11} style={{ color: "var(--con-faint)" }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" className="text-[12px]" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const checked = selectedIds.includes(o.id);
                return (
                  <CommandItem key={o.id} value={o.label} onSelect={() => toggle(o.id)}>
                    <span
                      className="flex h-[14px] w-[14px] items-center justify-center rounded-[3px]"
                      style={
                        checked
                          ? { background: "var(--accent-cyan)", color: "var(--accent-ink)" }
                          : { border: "1px solid var(--con-border-faint)" }
                      }
                    >
                      {checked && <Check size={9} strokeWidth={4} />}
                    </span>
                    {o.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
      <button
        disabled={pageNumber <= 1}
        onClick={() => onPageChange(pageNumber - 1)}
        style={{ color: pageNumber <= 1 ? "var(--con-faint)" : "var(--accent-cyan)" }}
        className="disabled:cursor-default"
      >
        PREV
      </button>
      {pages.map((n) => {
        const active = n === pageNumber;
        return (
          <button
            key={n}
            onClick={() => onPageChange(n)}
            className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px]"
            style={
              active
                ? { background: "var(--accent-cyan)", color: "var(--accent-ink)", fontWeight: 500 }
                : { border: "1px solid var(--con-border)" }
            }
          >
            {n}
          </button>
        );
      })}
      <button
        disabled={pageNumber >= maxPage}
        onClick={() => onPageChange(pageNumber + 1)}
        style={{ color: pageNumber >= maxPage ? "var(--con-faint)" : "var(--accent-cyan)" }}
        className="disabled:cursor-default"
      >
        NEXT
      </button>
    </div>
  );
}

function SceneCard({
  scene,
  stashBase,
  apiKey,
}: {
  scene: Scene;
  stashBase?: string;
  apiKey?: string;
}) {
  const shot = withApiKey(joinUrl(stashBase, scene.paths?.screenshot ?? ""), apiKey);
  return (
    <Link href={`/scenes/${scene.id}`} className="group relative block aspect-video overflow-hidden rounded-[6px] no-underline"
      style={{ border: "1px solid var(--con-border)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={shot}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ background: "var(--well)" }}
      />

      {/* Rating badge (always when rated) */}
      {scene.rating100 ? (
        <span
          className="absolute right-[7px] top-[7px] z-10 rounded-[5px] px-[6px] py-[2px] font-mono text-[9px]"
          style={{ background: "rgba(8,10,12,0.7)", color: "var(--rating)" }}
        >
          ★ {Math.round(scene.rating100 / 20)}
        </span>
      ) : null}

      {/* Hover overlay: performers (top) + title (bottom) */}
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: "linear-gradient(to top,rgba(8,10,12,0.92) 0%,rgba(8,10,12,0.1) 45%,rgba(8,10,12,0.55) 100%)" }} />
      {scene.performers && scene.performers.length > 0 && (
        <div className="absolute left-[7px] top-[7px] z-10 flex max-w-[calc(100%-14px)] flex-wrap gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {scene.performers.slice(0, 2).map((p) => (
            <span key={p.id} className="rounded-[4px] px-[6px] py-[2px] text-[9px] text-white"
              style={{ background: "rgba(76,179,224,0.25)", border: "1px solid rgba(76,179,224,0.4)" }}>
              {p.name}
            </span>
          ))}
          {scene.performers.length > 2 && (
            <span className="rounded-[4px] px-[6px] py-[2px] text-[9px] text-white"
              style={{ background: "rgba(76,179,224,0.25)", border: "1px solid rgba(76,179,224,0.4)" }}>
              +{scene.performers.length - 2}
            </span>
          )}
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-2 pb-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold text-white" title={scene.title}>
          {scene.title}
        </div>
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="aspect-video animate-pulse rounded-[6px]"
          style={{ background: "var(--well)", border: "1px solid var(--con-border)" }} />
      ))}
    </div>
  );
}

function ScenesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pageNumber, setPageNumber] = useState(1);
  const perPage = 42;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPerformerIds, setSelectedPerformerIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("title-asc");
  const [totalCount, setTotalCount] = useState(0);

  const settings = useSettings();
  const stashServer = settings["STASH_SERVER"];
  const stashAPI = settings["STASH_API"];

  const { stashTags, loading: tagsLoading, error: tagsError } = useStashTags();

  useEffect(() => {
    const title = searchParams.get("title") || "";
    const performers = searchParams.get("performers");
    const tags = searchParams.get("tags");
    const rating = (searchParams.get("rating") as RatingFilter) || "all";
    const sort = (searchParams.get("sort") as SortOption) || "title-asc";
    const page = parseInt(searchParams.get("page") || "1", 10);

    setSearchQuery(title);
    setSelectedPerformerIds(performers ? performers.split(",").filter(Boolean) : []);
    setSelectedTagIds(tags ? tags.split(",").filter(Boolean) : []);
    setRatingFilter(rating);
    setSortOption(sort);
    setPageNumber(page > 0 ? page : 1);
  }, [searchParams]);

  const updateURLWithFilters = (
    title?: string,
    performers?: string[],
    tags?: string[],
    rating?: RatingFilter,
    sort?: SortOption,
    page?: number
  ) => {
    const params = new URLSearchParams();
    const currentTitle = title !== undefined ? title : searchQuery;
    const currentPerformers = performers || selectedPerformerIds;
    const currentTags = tags || selectedTagIds;
    const currentRating = rating || ratingFilter;
    const currentSort = sort || sortOption;
    const currentPage = page !== undefined ? page : pageNumber;

    if (currentTitle.trim()) params.set("title", currentTitle);
    if (currentPerformers.length > 0) params.set("performers", currentPerformers.join(","));
    if (currentTags.length > 0) params.set("tags", currentTags.join(","));
    if (currentRating !== "all") params.set("rating", currentRating);
    if (currentSort !== "title-asc") params.set("sort", currentSort);
    if (currentPage > 1) params.set("page", currentPage.toString());

    router.replace(`/scenes${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  };

  const { data: performersData, loading: performersLoading } = useQuery(GET_PERFORMERS, {
    fetchPolicy: "cache-first",
    notifyOnNetworkStatusChange: false,
  });

  const isFiltering = useMemo(
    () =>
      searchQuery.trim() !== "" ||
      selectedPerformerIds.length > 0 ||
      selectedTagIds.length > 0 ||
      ratingFilter !== "all",
    [searchQuery, selectedPerformerIds, selectedTagIds, ratingFilter]
  );

  const { query, variables } = useMemo(() => {
    if (isFiltering) {
      return {
        query: GET_SCENES_FILTERED,
        variables: {
          title: searchQuery.trim() || "",
          performers: selectedPerformerIds.length > 0 ? selectedPerformerIds : null,
          tags: selectedTagIds.length > 0 ? selectedTagIds : null,
          rating: getRatingFilterValue(ratingFilter),
        },
      };
    }
    return { query: GET_SCENES_PAGINATED, variables: { pageNumber, perPage } };
  }, [isFiltering, searchQuery, selectedPerformerIds, selectedTagIds, ratingFilter, pageNumber, perPage]);

  const { data: queryData, loading, error } = useQuery(query, {
    variables,
    fetchPolicy: "cache-and-network",
    errorPolicy: "all",
  });

  const allScenes: Scene[] = useMemo(() => queryData?.findScenes?.scenes || [], [queryData]);

  useEffect(() => {
    if (queryData?.findScenes?.count !== undefined) setTotalCount(queryData.findScenes.count);
  }, [queryData]);

  const scenes = useMemo(() => {
    return [...allScenes].sort((a, b) => {
      switch (sortOption) {
        case "title-desc":
          return b.title.localeCompare(a.title);
        case "date-desc":
        case "date-asc":
          return sortOption === "date-desc" ? b.title.localeCompare(a.title) : a.title.localeCompare(b.title);
        case "rating-desc":
          return (b.rating100 || 0) - (a.rating100 || 0);
        case "rating-asc":
          return (a.rating100 || 0) - (b.rating100 || 0);
        case "title-asc":
        default:
          return a.title.localeCompare(b.title);
      }
    });
  }, [allScenes, sortOption]);

  const performerOptions: FilterOption[] = useMemo(
    () =>
      (performersData?.findPerformers?.performers || []).map((p: { id: string; name: string }) => ({
        id: String(p.id),
        label: p.name,
      })),
    [performersData]
  );

  const tagOptions: FilterOption[] = useMemo(
    () => (stashTags || []).map((t: { id: string; name: string }) => ({ id: String(t.id), label: t.name })),
    [stashTags]
  );

  const anyLoading = loading || tagsLoading || performersLoading;

  const countLine = !anyLoading && allScenes.length > 0
    ? isFiltering
      ? scenes.length === allScenes.length
        ? `${scenes.length} SCENE${scenes.length === 1 ? "" : "S"}`
        : `${scenes.length} OF ${allScenes.length} SCENES`
      : `PAGE ${pageNumber} · ${allScenes.length} SCENE${allScenes.length === 1 ? "" : "S"}`
    : "…";

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-[26px] pt-[22px]">
        <div>
          <h2 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">All Scenes</h2>
          <div className="con-count mt-1">{countLine}</div>
        </div>
        {!isFiltering && !anyLoading && scenes.length > 0 && (
          <PaginationControls
            pageNumber={pageNumber}
            perPage={perPage}
            totalCount={totalCount}
            onPageChange={(newPage) => {
              setPageNumber(newPage);
              updateURLWithFilters(undefined, undefined, undefined, undefined, undefined, newPage);
            }}
          />
        )}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-[9px] px-[26px] pb-4 pt-[18px]">
        <div className="relative w-[230px]">
          <Search size={14} className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2" style={{ color: "var(--con-faint)" }} />
          <input
            value={searchQuery}
            onChange={(e) => {
              const v = e.target.value;
              setSearchQuery(v);
              setPageNumber(1);
              updateURLWithFilters(v, undefined, undefined, undefined, undefined, 1);
            }}
            placeholder="search scenes…"
            aria-label="Search scenes"
            className="con-input w-full pl-[33px]"
          />
        </div>

        <Select
          value={sortOption}
          onValueChange={(v) => {
            const s = v as SortOption;
            setSortOption(s);
            updateURLWithFilters(undefined, undefined, undefined, undefined, s);
          }}
        >
          <SelectTrigger className="h-auto gap-2 rounded-[6px] border-[var(--con-border)] bg-[var(--well)] px-3 py-2 font-mono text-[12px] text-[var(--con-text-2)]" style={{ minWidth: 150 }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortOption[]).map((k) => (
              <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="min-w-[200px] flex-1">
          <MultiSelect
            placeholder="Filter by performers…"
            options={performerOptions}
            selectedIds={selectedPerformerIds}
            onChange={(ids) => {
              setSelectedPerformerIds(ids);
              setPageNumber(1);
              updateURLWithFilters(undefined, ids, undefined, undefined, undefined, 1);
            }}
          />
        </div>

        <div className="min-w-[200px] flex-1">
          <MultiSelect
            placeholder="Filter by tags…"
            options={tagOptions}
            selectedIds={selectedTagIds}
            onChange={(ids) => {
              setSelectedTagIds(ids);
              setPageNumber(1);
              updateURLWithFilters(undefined, undefined, ids, undefined, undefined, 1);
            }}
          />
        </div>

        <Select
          value={ratingFilter}
          onValueChange={(v) => {
            const r = v as RatingFilter;
            setRatingFilter(r);
            setPageNumber(1);
            updateURLWithFilters(undefined, undefined, undefined, r, undefined, 1);
          }}
        >
          <SelectTrigger className="h-auto rounded-[6px] border-[var(--con-border)] bg-[var(--well)] px-3 py-2 text-[12px] text-[var(--con-text-2)]" style={{ minWidth: 120 }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RATING_LABELS) as RatingFilter[]).map((k) => (
              <SelectItem key={k} value={k}>{RATING_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          onClick={() => {
            setSearchQuery("");
            setSelectedPerformerIds([]);
            setSelectedTagIds([]);
            setRatingFilter("all");
            setSortOption("title-asc");
            setPageNumber(1);
            updateURLWithFilters("", [], [], "all", "title-asc", 1);
          }}
          className="font-mono text-[12px]"
          style={{ color: "var(--accent-cyan)" }}
        >
          CLEAR
        </button>
      </div>

      <div className="px-[26px] pb-[26px]">
        {anyLoading && <SkeletonGrid />}

        {!anyLoading && (error || tagsError) && (
          <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error?.message || String(tagsError)}</p>
        )}

        {!anyLoading && scenes.length === 0 && totalCount === 0 && (
          <div className="rounded-[7px] p-6 text-center" style={{ background: "var(--surface)", border: "1px solid var(--con-border)" }}>
            <div className="text-[14px] font-semibold">No scenes found.</div>
          </div>
        )}

        {!anyLoading && scenes.length === 0 && totalCount > 0 && (
          <div className="rounded-[7px] p-6 text-center" style={{ background: "var(--surface)", border: "1px solid var(--con-border)" }}>
            <div className="text-[14px] font-semibold">No scenes match your filters.</div>
            <div className="mt-1 text-[13px]" style={{ color: "var(--con-muted)" }}>
              Try adjusting your search terms or clearing filters.
            </div>
          </div>
        )}

        {!anyLoading && scenes.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {scenes.map((scene) => (
              <SceneCard key={scene.id} scene={scene} stashBase={stashServer} apiKey={stashAPI} />
            ))}
          </div>
        )}

        {!isFiltering && !anyLoading && scenes.length > 0 && (
          <PaginationControls
            className="mt-5 justify-center"
            pageNumber={pageNumber}
            perPage={perPage}
            totalCount={totalCount}
            onPageChange={(newPage) => {
              setPageNumber(newPage);
              updateURLWithFilters(undefined, undefined, undefined, undefined, undefined, newPage);
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function ScenesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full flex-col px-[26px] pt-[22px]">
          <h2 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">All Scenes</h2>
          <div className="mt-5">
            <SkeletonGrid />
          </div>
        </div>
      }
    >
      <ScenesContent />
    </Suspense>
  );
}
