// src/app/scenes/page.tsx
"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useQuery, gql } from "@apollo/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useSettings } from "@/app/context/SettingsContext";
import { useStashTags } from "@/context/StashTagsContext";
import Link from "next/link";

import {
  Sheet,
  Box,
  Typography,
  Grid,
  Card,
  CardContent as JoyCardContent,
  AspectRatio,
  CardCover,
  Button,
  Chip,
  Autocomplete,
  Skeleton,
  Input,
  Select,
  Option,
  FormControl,
  Stack,
  IconButton,
} from "@mui/joy";

import { Search, ArrowUpDown } from "lucide-react";

// Paginated query for browsing (fast initial load)
const GET_SCENES_PAGINATED = gql`
  query getScenesPaginated($pageNumber: Int!, $perPage: Int!) {
    findScenes(
      scene_filter: {}
      filter: { 
        page: $pageNumber, 
        per_page: $perPage
      }
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
        paths {
          screenshot
        }
        performers {
          id
          name
        }
        tags {
          id
          name
        }
        rating100
      }
    }
  }
`;

// Get all performers for filter options
const GET_PERFORMERS = gql`
  query getPerformers {
    findPerformers(filter: { per_page: -1, sort: "name", direction: ASC }) {
      performers {
        id
        name
      }
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
  if (ratingFilter === 'all') return 0; // No filtering - include all (all ratings > 0)
  const starValue = parseInt(ratingFilter.replace('+', ''), 10);
  // Convert to GREATER_THAN values: 1→19, 2→39, 3→59, 4→79, 5→99
  // This works because Stash uses 20,40,60,80,100 for 1-5 stars
  return (starValue * 20) - 1;
}

// Reusable pagination controls component (copied from actors page)
function PaginationControls({ 
  pageNumber, 
  perPage, 
  totalCount,
  onPageChange, 
  sx = {} 
}: {
  pageNumber: number;
  perPage: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  sx?: Record<string, unknown>;
}) {
  // Calculate the maximum page number based on total count
  const maxPage = Math.ceil(totalCount / perPage);
  
  return (
    <Box sx={{ display: "flex", justifyContent: "center", gap: 1, alignItems: "center", ...sx }}>
      <Button
        size="sm"
        variant="plain"
        disabled={pageNumber <= 1}
        onClick={() => onPageChange(pageNumber - 1)}
      >
        Previous
      </Button>
      
      {/* Page numbers */}
      {[pageNumber - 2, pageNumber - 1, pageNumber, pageNumber + 1, pageNumber + 2]
        .filter((n) => n >= 1 && n <= maxPage) // Filter to only show valid pages
        .map((n) => (
          <Chip
            key={n}
            variant={n === pageNumber ? "solid" : "soft"}
            color={n === pageNumber ? "primary" : "neutral"}
            size="sm"
            onClick={() => onPageChange(n)}
            sx={{ cursor: "pointer" }}
          >
            {n}
          </Chip>
        ))}
      
      <Button
        size="sm"
        variant="plain"
        disabled={pageNumber >= maxPage} // Disable if on last page or beyond
        onClick={() => onPageChange(pageNumber + 1)}
      >
        Next
      </Button>
    </Box>
  );
}

function HoverPreview({
  screenshot,
  alt,
  stashBase,
  apiKey,
}: {
  screenshot?: string;
  alt: string;
  stashBase?: string;
  apiKey?: string;
}) {
  const resolvedShot = withApiKey(joinUrl(stashBase, screenshot ?? ""), apiKey);

  return (
    <Box
      sx={{ position: "relative", width: "100%", height: "100%", outline: "none" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedShot}
        alt={alt}
        loading="lazy"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          pointerEvents: "none",
        }}
      />
    </Box>
  );
}

function ScenesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Pagination state
  const [pageNumber, setPageNumber] = useState(1);
  const perPage = 42;
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPerformerIds, setSelectedPerformerIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("title-asc");
  
  // Total count state
  const [totalCount, setTotalCount] = useState(0);

  const settings = useSettings();
  const stashServer = settings["STASH_SERVER"];
  const stashAPI = settings["STASH_API"];

  const { stashTags, loading: tagsLoading, error: tagsError } = useStashTags();

  // Initialize filters from URL on mount
  useEffect(() => {
    const title = searchParams.get('title') || '';
    const performers = searchParams.get('performers');
    const tags = searchParams.get('tags');
    const rating = searchParams.get('rating') as RatingFilter || 'all';
    const sort = searchParams.get('sort') as SortOption || 'title-asc';
    const page = parseInt(searchParams.get('page') || '1', 10);

    setSearchQuery(title);
    setSelectedPerformerIds(performers ? performers.split(',').filter(Boolean) : []);
    setSelectedTagIds(tags ? tags.split(',').filter(Boolean) : []);
    setRatingFilter(rating);
    setSortOption(sort);
    setPageNumber(page > 0 ? page : 1);
  }, [searchParams]);

  // Function to update URL with current filter state
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
    
    if (currentTitle.trim()) {
      params.set('title', currentTitle);
    }
    if (currentPerformers.length > 0) {
      params.set('performers', currentPerformers.join(','));
    }
    if (currentTags.length > 0) {
      params.set('tags', currentTags.join(','));
    }
    if (currentRating !== 'all') {
      params.set('rating', currentRating);
    }
    if (currentSort !== 'title-asc') {
      params.set('sort', currentSort);
    }
    if (currentPage > 1) {
      params.set('page', currentPage.toString());
    }
    
    const newUrl = `/scenes${params.toString() ? `?${params.toString()}` : ''}`;
    router.replace(newUrl, { scroll: false });
  };

  // Get performers data (cached aggressively for performance)
  const { data: performersData, loading: performersLoading } = useQuery(GET_PERFORMERS, {
    fetchPolicy: 'cache-first',
    notifyOnNetworkStatusChange: false
  });

  // Determine if we're filtering (search or filters applied)
  const isFiltering = useMemo(() => {
    return searchQuery.trim() !== '' || selectedPerformerIds.length > 0 || selectedTagIds.length > 0 || ratingFilter !== 'all';
  }, [searchQuery, selectedPerformerIds, selectedTagIds, ratingFilter]);

  // Choose query and parameters based on filtering state
  const { query, variables } = useMemo(() => {
    if (isFiltering) {
      // When filtering: get all matching results
      return {
        query: GET_SCENES_FILTERED,
        variables: { 
          title: searchQuery.trim() || "",
          performers: selectedPerformerIds.length > 0 ? selectedPerformerIds : null,
          tags: selectedTagIds.length > 0 ? selectedTagIds : null,
          rating: getRatingFilterValue(ratingFilter)
        }
      };
    } else {
      // When browsing: use pagination
      return {
        query: GET_SCENES_PAGINATED,
        variables: { pageNumber, perPage }
      };
    }
  }, [isFiltering, searchQuery, selectedPerformerIds, selectedTagIds, ratingFilter, pageNumber, perPage]);

  // Main GraphQL query
  const { data: queryData, loading, error } = useQuery(query, {
    variables,
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all'
  });

  // Extract scenes and total count from query response
  const allScenes: Scene[] = useMemo(() => {
    return queryData?.findScenes?.scenes || [];
  }, [queryData]);

  // Update total count when query data changes
  useEffect(() => {
    if (queryData?.findScenes?.count !== undefined) {
      setTotalCount(queryData.findScenes.count);
    }
  }, [queryData]);

  // Apply client-side sorting (rating filtering now handled server-side)
  const scenes = useMemo(() => {
    // Apply sorting (create a copy to avoid mutating read-only array)
    const sorted = [...allScenes].sort((a, b) => {
      switch (sortOption) {
        case "title-desc":
          return b.title.localeCompare(a.title);
        case "date-desc":
        case "date-asc":
          // We don't have date field, fallback to title
          return sortOption === "date-desc" ? 
            b.title.localeCompare(a.title) : a.title.localeCompare(b.title);
        case "rating-desc":
          return (b.rating100 || 0) - (a.rating100 || 0);
        case "rating-asc":
          return (a.rating100 || 0) - (b.rating100 || 0);
        case "title-asc":
        default:
          return a.title.localeCompare(b.title);
      }
    });

    return sorted;
  }, [allScenes, sortOption]);

  // Prepare options for filters
  type FilterOption = { id: string; label: string };

  const performerOptions: FilterOption[] = useMemo(() => {
    return (performersData?.findPerformers?.performers || []).map((p: { id: string; name: string }) => ({
      id: String(p.id),
      label: p.name
    }));
  }, [performersData]);

  const tagOptions: FilterOption[] = useMemo(() => {
    return (stashTags || []).map((t: { id: string; name: string }) => ({
      id: String(t.id),
      label: t.name
    }));
  }, [stashTags]);

  const selectedPerformerOptions = useMemo(() => {
    return selectedPerformerIds.map(id =>
      performerOptions.find((p: FilterOption) => p.id === id)
    ).filter((v): v is FilterOption => v !== undefined);
  }, [selectedPerformerIds, performerOptions]);

  const selectedTagOptions = useMemo(() => {
    return selectedTagIds.map(id =>
      tagOptions.find((t: FilterOption) => t.id === id)
    ).filter((v): v is FilterOption => v !== undefined);
  }, [selectedTagIds, tagOptions]);

  const anyLoading = loading || tagsLoading || performersLoading;

  return (
    <Sheet sx={{ p: 2, maxWidth: "90vw", mx: "auto" }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Typography level="h2" sx={{ mb: 1 }}>
          All Scenes
        </Typography>
        {!anyLoading && allScenes.length > 0 && (
          <Typography level="body-sm" color="neutral">
            {isFiltering 
              ? (scenes.length === allScenes.length 
                  ? `${scenes.length} scene${scenes.length === 1 ? '' : 's'}`
                  : `${scenes.length} of ${allScenes.length} scenes`)
              : `Page ${pageNumber} • ${allScenes.length} scene${allScenes.length === 1 ? '' : 's'}`
            }
          </Typography>
        )}
      </Box>

      {/* Search and Filters */}
      <Stack 
        direction={{ xs: "column", lg: "row" }} 
        spacing={2} 
        alignItems={{ xs: "stretch", lg: "center" }}
        sx={{ mb: 2 }}
      >
        <FormControl sx={{ flexGrow: 1, maxWidth: { lg: 300 } }}>
          <Input
            placeholder="Search scenes..."
            value={searchQuery}
            onChange={(e) => {
              const newValue = e.target.value;
              setSearchQuery(newValue);
              setPageNumber(1);
              updateURLWithFilters(newValue, undefined, undefined, undefined, undefined, 1);
            }}
            startDecorator={<Search size={16} />}
            endDecorator={
              searchQuery && (
                <IconButton
                  size="sm"
                  variant="plain"
                  onClick={() => {
                    setSearchQuery("");
                    setPageNumber(1);
                    updateURLWithFilters("", undefined, undefined, undefined, undefined, 1);
                  }}
                  sx={{ minHeight: 0, minWidth: 0 }}
                >
                  ×
                </IconButton>
              )
            }
            size="sm"
          />
        </FormControl>
        
        <FormControl sx={{ minWidth: { xs: "100%", lg: 180 } }}>
          <Select
            value={sortOption}
            onChange={(_, value) => {
              const newSort = value as SortOption;
              setSortOption(newSort);
              updateURLWithFilters(undefined, undefined, undefined, undefined, newSort);
            }}
            startDecorator={<ArrowUpDown size={16} />}
            size="sm"
          >
            <Option value="title-asc">Title (A-Z)</Option>
            <Option value="title-desc">Title (Z-A)</Option>
            <Option value="date-desc">Newest First</Option>
            <Option value="date-asc">Oldest First</Option>
            <Option value="rating-desc">Highest Rated</Option>
            <Option value="rating-asc">Lowest Rated</Option>
          </Select>
        </FormControl>

        <FormControl sx={{ flexGrow: 1, minWidth: { xs: "100%", lg: 200 } }}>
          <Autocomplete
            placeholder="Filter by performers..."
            multiple
            options={performerOptions}
            value={selectedPerformerOptions}
            onChange={(_e, val) => {
              const newPerformerIds = val.map(v => v.id);
              setSelectedPerformerIds(newPerformerIds);
              setPageNumber(1);
              updateURLWithFilters(undefined, newPerformerIds, undefined, undefined, undefined, 1);
            }}
            getOptionLabel={(o) => (typeof o === "string" ? o : o.label)}
            isOptionEqualToValue={(a, b) => a?.id === b?.id}
            size="sm"
          />
        </FormControl>

        <FormControl sx={{ flexGrow: 1, minWidth: { xs: "100%", lg: 200 } }}>
          <Autocomplete
            placeholder="Filter by tags..."
            multiple
            options={tagOptions}
            value={selectedTagOptions}
            onChange={(_e, val) => {
              const newTagIds = val.map(v => v.id);
              setSelectedTagIds(newTagIds);
              setPageNumber(1);
              updateURLWithFilters(undefined, undefined, newTagIds, undefined, undefined, 1);
            }}
            getOptionLabel={(o) => (typeof o === "string" ? o : o.label)}
            isOptionEqualToValue={(a, b) => a?.id === b?.id}
            size="sm"
          />
        </FormControl>

        <FormControl sx={{ minWidth: { xs: "100%", lg: 120 } }}>
          <Select
            value={ratingFilter}
            onChange={(_, value) => {
              const newRating = value as RatingFilter;
              setRatingFilter(newRating);
              setPageNumber(1);
              updateURLWithFilters(undefined, undefined, undefined, newRating, undefined, 1);
            }}
            size="sm"
          >
            <Option value="all">All Ratings</Option>
            <Option value="1+">1+ Stars</Option>
            <Option value="2+">2+ Stars</Option>
            <Option value="3+">3+ Stars</Option>
            <Option value="4+">4+ Stars</Option>
            <Option value="5">5 Stars</Option>
          </Select>
        </FormControl>

        <Button
          size="sm"
          variant="plain"
          onClick={() => {
            setSearchQuery("");
            setSelectedPerformerIds([]);
            setSelectedTagIds([]);
            setRatingFilter("all");
            setSortOption("title-asc");
            setPageNumber(1);
            updateURLWithFilters("", [], [], "all", "title-asc", 1);
          }}
          sx={{ minWidth: "auto" }}
        >
          Clear all
        </Button>
      </Stack>

      {/* Top Pagination Controls - only show when not filtering */}
      {!isFiltering && !anyLoading && scenes.length > 0 && (
        <PaginationControls 
          pageNumber={pageNumber}
          perPage={perPage}
          totalCount={totalCount}
          onPageChange={(newPage) => {
            setPageNumber(newPage);
            updateURLWithFilters(undefined, undefined, undefined, undefined, undefined, newPage);
          }}
          sx={{ mb: 2 }}
        />
      )}

      {/* Loading / Errors */}
      {anyLoading && (
        <Grid container spacing={2}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Grid key={i} xs={12} sm={6} md={4} lg={3} xl={2}>
              <Card sx={{ borderRadius: "lg", overflow: "hidden" }}>
                <AspectRatio ratio="16/9">
                  <Skeleton />
                </AspectRatio>
                <JoyCardContent>
                  <Skeleton variant="text" level="title-sm" />
                  <Skeleton variant="text" level="body-sm" />
                </JoyCardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {!anyLoading && (error || tagsError) && (
        <Typography color="danger" level="body-sm" sx={{ mb: 2 }}>
          {error?.message || tagsError}
        </Typography>
      )}

      {/* Empty state */}
      {!anyLoading && scenes.length === 0 && totalCount === 0 && (
        <Sheet
          variant="soft"
          color="neutral"
          sx={{ p: 3, borderRadius: "lg", textAlign: "center" }}
        >
          <Typography level="title-md">No scenes found.</Typography>
        </Sheet>
      )}

      {/* No results after filtering */}
      {!anyLoading && scenes.length === 0 && totalCount > 0 && (
        <Sheet
          variant="soft"
          color="neutral"
          sx={{ p: 3, borderRadius: "lg", textAlign: "center" }}
        >
          <Typography level="title-md">No scenes match your filters.</Typography>
          <Typography level="body-sm" sx={{ mt: 1 }}>
            Try adjusting your search terms or clearing filters.
          </Typography>
        </Sheet>
      )}

      {/* Scene Cards */}
      {!anyLoading && scenes.length > 0 && (
        <>
          <Grid container spacing={2}>
            {scenes.map((scene: Scene) => (
              <Grid key={scene.id} xs={12} sm={6} md={4} lg={3} xl={2}>
                <Link href={`/scenes/${scene.id}`} style={{ textDecoration: "none" }}>
                  <Card
                    sx={{
                      p: 0,
                      overflow: "hidden",
                      borderRadius: "lg",
                      position: "relative",
                      boxShadow: "sm",
                      transition: "transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease",
                      border: "2px solid transparent",
                      "&:hover": { 
                        transform: "translateY(-2px)", 
                        boxShadow: "md",
                        borderColor: "primary.200",
                      },
                      cursor: "pointer",
                    }}
                  >
                    <AspectRatio ratio="16/9">
                      <CardCover sx={{ pointerEvents: "auto" }}>
                        <HoverPreview
                          screenshot={scene.paths?.screenshot}
                          alt={scene.title}
                          stashBase={stashServer}
                          apiKey={stashAPI}
                        />
                      </CardCover>

                      {/* Rating display (top-right) */}
                      {scene.rating100 && (
                        <Box
                          sx={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            backgroundColor: "rgba(0, 0, 0, 0.7)",
                            borderRadius: "6px",
                            px: 0.75,
                            py: 0.25,
                            backdropFilter: "blur(4px)",
                            border: "1px solid rgba(255, 255, 255, 0.2)",
                          }}
                        >
                          <Typography
                            level="body-xs"
                            sx={{ color: "#fff", fontWeight: 600 }}
                          >
                            ★ {Math.round(scene.rating100 / 20)}
                          </Typography>
                        </Box>
                      )}

                      {/* Performers chips (top-left) */}
                      {scene.performers && scene.performers.length > 0 && (
                        <Box
                          sx={{
                            position: "absolute",
                            top: 8,
                            left: 8,
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 0.5,
                            maxWidth: "calc(100% - 16px)",
                          }}
                        >
                          {scene.performers.slice(0, 2).map((performer) => (
                            <Chip
                              key={performer.id}
                              size="sm"
                              variant="soft"
                              sx={{
                                backgroundColor: "rgba(0, 0, 0, 0.7)",
                                color: "#fff",
                                backdropFilter: "blur(4px)",
                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                fontSize: "0.75rem",
                              }}
                            >
                              {performer.name}
                            </Chip>
                          ))}
                          {scene.performers.length > 2 && (
                            <Chip
                              size="sm"
                              variant="soft"
                              sx={{
                                backgroundColor: "rgba(0, 0, 0, 0.7)",
                                color: "#fff",
                                backdropFilter: "blur(4px)",
                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                fontSize: "0.75rem",
                              }}
                            >
                              +{scene.performers.length - 2}
                            </Chip>
                          )}
                        </Box>
                      )}

                      {/* Bottom gradient + title */}
                      <Box
                        sx={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 0,
                          px: 1,
                          py: 0.75,
                          background:
                            "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 80%)",
                        }}
                      >
                        <Typography
                          level="title-sm"
                          sx={{
                            color: "#fff",
                            textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                          }}
                          title={scene.title}
                        >
                          {scene.title}
                        </Typography>
                      </Box>
                    </AspectRatio>
                  </Card>
                </Link>
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {/* Bottom Pagination Controls - only show when not filtering */}
      {!isFiltering && !anyLoading && scenes.length > 0 && (
        <PaginationControls 
          pageNumber={pageNumber}
          perPage={perPage}
          totalCount={totalCount}
          onPageChange={(newPage) => {
            setPageNumber(newPage);
            updateURLWithFilters(undefined, undefined, undefined, undefined, undefined, newPage);
          }}
          sx={{ mt: 3 }}
        />
      )}
    </Sheet>
  );
}

export default function ScenesPage() {
  return (
    <Suspense fallback={
      <Sheet sx={{ p: 2, maxWidth: "90vw", mx: "auto" }}>
        <Box sx={{ mb: 2 }}>
          <Typography level="h2" sx={{ mb: 1 }}>
            All Scenes
          </Typography>
        </Box>
        <Grid container spacing={2}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Grid key={i} xs={12} sm={6} md={4} lg={3} xl={2}>
              <Card sx={{ borderRadius: "lg", overflow: "hidden" }}>
                <AspectRatio ratio="16/9">
                  <Skeleton />
                </AspectRatio>
                <JoyCardContent>
                  <Skeleton variant="text" level="title-sm" />
                  <Skeleton variant="text" level="body-sm" />
                </JoyCardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Sheet>
    }>
      <ScenesContent />
    </Suspense>
  );
}