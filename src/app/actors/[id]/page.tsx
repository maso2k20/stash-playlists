// src/app/actors/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, gql } from "@apollo/client";
import { useParams, useRouter } from "next/navigation";
import { useSettings } from "@/app/context/SettingsContext";
import { useStashTags } from "@/context/StashTagsContext";
import { formatLength } from "@/lib/formatLength";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { makeStashUrl } from "@/lib/urlUtils";

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
  Checkbox,
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Skeleton,
  Input,
  Select,
  Option,
  FormControl,
  Stack,
  IconButton,
} from "@mui/joy";

import { Search, ArrowUpDown, Plus, CheckSquare, Square, Film } from "lucide-react";
import FFmpegClipGenerator from "@/components/FFmpegClipGenerator";

import StarRating from "@/components/StarRating";

// Paginated queries for browsing (fast initial load)
const GET_MARKERS_PAGINATED = gql`
  query getActorMarkersPaginated($actorId: ID!, $pageNumber: Int!, $perPage: Int!) {
    findSceneMarkers(
      scene_marker_filter: {
        performers: { modifier: INCLUDES, value: [$actorId] }
      }
      filter: { page: $pageNumber, per_page: $perPage }
    ) {
      count
      scene_markers {
        id
        title
        seconds
        end_seconds
        screenshot
        stream
        preview
        scene { id }
      }
    }
  }
`;

// Filtered queries for search/tag filtering (all results)
const GET_MARKERS_FILTERED = gql`
  query getActorMarkersFiltered($actorId: ID!, $tagID: [ID!]!) {
    findSceneMarkers(
      scene_marker_filter: {
        performers: { modifier: INCLUDES, value: [$actorId] }
        tags: { modifier: INCLUDES, value: $tagID }
      }
      filter: { per_page: -1 }
    ) {
      count
      scene_markers {
        id
        title
        seconds
        end_seconds
        screenshot
        stream
        preview
        scene { id }
      }
    }
  }
`;


type Playlist = { id: string; name: string; type: string };

type SortOption = 
  | "title-asc" 
  | "title-desc" 
  | "duration-asc"
  | "duration-desc"
  | "rating-desc"
  | "rating-asc";

/** HoverPreview
 * - If preview is .webm: show <video> on hover, screenshot otherwise.
 * - If preview is .webp: swap <img src> to preview on hover.
 * - Falls back to screenshot if no preview provided.
 */

// Reusable pagination controls component
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
  sx?: any;
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
  preview,
  alt,
  stashBase,
  apiKey,
}: {
  screenshot: string;
  preview?: string | null;
  alt: string;
  stashBase?: string;
  apiKey?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [videoErrored, setVideoErrored] = useState(false);

  const resolvedPreview = makeStashUrl(preview, stashBase, apiKey);
  const resolvedShot = makeStashUrl(screenshot, stashBase, apiKey);

  const hasPreview = !!resolvedPreview;

  // ONLY treat as video if it clearly has a video extension
  const isVideo = hasPreview && /\.(webm|mp4)(?:$|\?)/i.test(resolvedPreview);

  // show <img> with screenshot normally; swap to preview image on hover
  const showVideo = hovered && isVideo && !videoErrored;
  const imgSrc = hovered && hasPreview && !isVideo ? resolvedPreview : resolvedShot;

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      tabIndex={0}
      sx={{ position: "relative", width: "100%", height: "100%", outline: "none" }}
    >
      {/* Base/hover image (handles animated WebP fine) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgSrc}
        alt={alt}
        loading="lazy"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: showVideo ? "none" : "block",
          pointerEvents: "none",
        }}
      />

      {/* Only show video on hover if it's actually a video URL */}
      {showVideo && (
        <video
          src={resolvedPreview}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          onError={() => setVideoErrored(true)} // fall back to image if playback fails
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            pointerEvents: "none",
          }}
        />
      )}
    </Box>
  );
}

export default function Page() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const actorId = params.id;

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [playlistsError, setPlaylistsError] = useState<string | null>(null);
  
  // Individual marker playlist dialog state
  const [isSingleDialogOpen, setIsSingleDialogOpen] = useState(false);
  const [singleMarker, setSingleMarker] = useState<any>(null);
  const [singlePlaylistId, setSinglePlaylistId] = useState<string>("");

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("title-asc");
  
  // Pagination state
  const [pageNumber, setPageNumber] = useState(1);
  const perPage = 42;
  
  // Total count state
  const [totalCount, setTotalCount] = useState(0);

  // FFmpeg selection state
  const [selectedMarkerIds, setSelectedMarkerIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [ffmpegDialogOpen, setFfmpegDialogOpen] = useState(false);

  // Initialize filters from URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Parse tag IDs from URL
    const tagParam = urlParams.get('tags');
    if (tagParam) {
      const tagIds = tagParam.split(',').filter(Boolean);
      setSelectedTagIds(tagIds);
    }
    
    // Parse search query from URL
    const searchParam = urlParams.get('search');
    if (searchParam) {
      setSearchQuery(searchParam);
    }
    
    // Parse sort option from URL
    const sortParam = urlParams.get('sort');
    if (sortParam && ["title-asc", "title-desc", "duration-asc", "duration-desc", "rating-desc", "rating-asc"].includes(sortParam)) {
      setSortOption(sortParam as SortOption);
    }
    
    // Parse page number from URL
    const pageParam = urlParams.get('page');
    if (pageParam) {
      const page = parseInt(pageParam, 10);
      if (page > 0) {
        setPageNumber(page);
      }
    }
  }, []);

  const pathname = usePathname();
  const isMarkersPage = !pathname?.includes("/scenes") && !pathname?.includes("/playlists");
  const isScenesPage = pathname?.includes("/scenes");
  const isPlaylistsPage = pathname?.includes("/playlists");
  
  // Function to update URL with current filter state
  const updateURLWithFilters = (tags?: string[], search?: string, sort?: SortOption, page?: number) => {
    const params = new URLSearchParams();
    
    const currentTags = tags || selectedTagIds;
    const currentSearch = search !== undefined ? search : searchQuery;
    const currentSort = sort || sortOption;
    const currentPage = page !== undefined ? page : pageNumber;
    
    if (currentTags.length > 0) {
      params.set('tags', currentTags.join(','));
    }
    if (currentSearch.trim()) {
      params.set('search', currentSearch);
    }
    if (currentSort !== 'title-asc') {
      params.set('sort', currentSort);
    }
    if (currentPage > 1) {
      params.set('page', currentPage.toString());
    }
    
    const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    router.replace(newUrl, { scroll: false });
  };

  const settings = useSettings();
  const stashServer = settings["STASH_SERVER"];
  const stashAPI = settings["STASH_API"];

  const { stashTags, loading: tagsLoading, error: tagsError } = useStashTags();


  // Load playlists
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/playlists");
        if (!res.ok) throw new Error(res.statusText);
        const json = await res.json();
        setPlaylists(json ?? []);
      } catch (e: any) {
        setPlaylistsError(e.message ?? "Failed to load playlists");
      } finally {
        setPlaylistsLoading(false);
      }
    })();
  }, []);

  // Tag options for multi-select
  const tagOptions = useMemo(
    () => (stashTags || []).map((t: any) => ({ id: String(t.id), label: t.name as string })),
    [stashTags]
  );
  const selectedTagOptions = selectedTagIds.map(id => 
    tagOptions.find((t: any) => t.id === id)
  ).filter(Boolean);

  // Stable empty array reference to prevent cache misses
  const EMPTY_ARRAY: string[] = useMemo(() => [], []);
  
  // Determine if we're filtering (search or tags selected)
  const isFiltering = useMemo(() => {
    return searchQuery.trim() !== '' || selectedTagIds.length > 0;
  }, [searchQuery, selectedTagIds]);
  
  // Query markers with chosen tags, or empty array for all markers
  const tagIDsForFilter = useMemo(() => {
    // Only use specific tags if selected, otherwise use stable empty array (= all markers)
    return selectedTagIds.length > 0 ? selectedTagIds : EMPTY_ARRAY;
  }, [selectedTagIds, EMPTY_ARRAY]);

  // Choose query and parameters based on filtering state
  const { query, variables } = useMemo(() => {
    if (isFiltering) {
      // When filtering: get all matching results
      return {
        query: GET_MARKERS_FILTERED,
        variables: { actorId, tagID: tagIDsForFilter }
      };
    } else {
      // When browsing: use pagination
      return {
        query: GET_MARKERS_PAGINATED,
        variables: { actorId, pageNumber, perPage }
      };
    }
  }, [isFiltering, actorId, tagIDsForFilter, pageNumber, perPage]);

  // Direct GraphQL query
  const { data: queryData, loading, error } = useQuery(query, {
    variables,
    skip: !actorId,
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all'
  });

  // Extract scenes and total count from query response
  const allScenes = useMemo(() => {
    return queryData?.findSceneMarkers?.scene_markers || [];
  }, [queryData]);

  // Update total count when query data changes
  useEffect(() => {
    if (queryData?.findSceneMarkers?.count !== undefined) {
      setTotalCount(queryData.findSceneMarkers.count);
    }
  }, [queryData]);


  // Filter and sort scenes
  const scenes = useMemo(() => {
    let filtered = allScenes;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((marker: any) => 
        marker.title.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a: any, b: any) => {
      const ratingA = ratings[a.id] || 0;
      const ratingB = ratings[b.id] || 0;
      const durationA = (a.end_seconds || 0) - (a.seconds || 0);
      const durationB = (b.end_seconds || 0) - (b.seconds || 0);

      switch (sortOption) {
        case "title-asc":
          return a.title.localeCompare(b.title);
        case "title-desc":
          return b.title.localeCompare(a.title);
        case "duration-asc":
          return durationA - durationB;
        case "duration-desc":
          return durationB - durationA;
        case "rating-desc":
          return ratingB - ratingA;
        case "rating-asc":
          return ratingA - ratingB;
        default:
          return 0;
      }
    });

    return sorted;
  }, [allScenes, searchQuery, sortOption, ratings]);

  // Fetch ratings for current markers
  useEffect(() => {
    if (allScenes.length === 0) return;
    
    const markerIds = allScenes.map((marker: any) => marker.id);
    const idsParam = markerIds.join(',');
    
    // Fetch ratings for current markers
    fetch(`/api/items/ratings?ids=${encodeURIComponent(idsParam)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.ratings) {
          setRatings(data.ratings);
        }
      })
      .catch(err => {
        console.error('Failed to fetch ratings:', err);
      });
  }, [allScenes]);


  const manualPlaylists = useMemo(
    () => playlists.filter((pl) => pl.type === "MANUAL"),
    [playlists]
  );

  // Selection helpers
  const toggleMarkerSelection = (markerId: string) => {
    setSelectedMarkerIds((prev) => {
      const next = new Set(prev);
      if (next.has(markerId)) {
        next.delete(markerId);
      } else {
        next.add(markerId);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedMarkerIds(new Set(scenes.map((m: any) => m.id)));
  };

  const clearSelection = () => {
    setSelectedMarkerIds(new Set());
  };

  // Get selected markers data for FFmpeg dialog
  const selectedMarkers = useMemo(() => {
    return scenes.filter((m: any) => selectedMarkerIds.has(m.id));
  }, [scenes, selectedMarkerIds]);

  // Handle opening single marker playlist dialog
  const handleAddSingleToPlaylist = (marker: any, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent card click navigation
    setSingleMarker(marker);
    setIsSingleDialogOpen(true);
  };

  // Confirm adding single marker to playlist
  const confirmSingleAdd = async () => {
    if (!singleMarker || !singlePlaylistId) return;

    const preview = singleMarker.preview ?? singleMarker.screenshot ?? null;
    const item = {
      id: singleMarker.id,
      title: singleMarker.title,
      startTime: singleMarker.seconds,
      endTime: singleMarker.end_seconds,
      screenshot: singleMarker.screenshot,
      stream: singleMarker.stream,
      preview,
    };

    try {
      const res = await fetch(`/api/playlists/${singlePlaylistId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [item] }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Add single marker to playlist failed:", result);
      } else {
        setSingleMarker(null);
        setSinglePlaylistId("");
        setIsSingleDialogOpen(false);
      }
    } catch (err) {
      console.error("Network or code error:", err);
    }
  };


  const anyLoading = loading || tagsLoading || playlistsLoading;

  return (
    <Sheet sx={{ p: 2, maxWidth: "90vw", mx: "auto" }}>
      {/* Header / Actions */}
      <Box
        sx={{
          display: "flex",
          gap: 1,
          alignItems: "center",
          flexWrap: "wrap",
          mb: 2,
        }}
      >

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexGrow: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Link href={`/actors/${actorId}/playlists`} passHref>
              <Button
                size="sm"
                variant={isPlaylistsPage ? "solid" : "soft"}
              >
                Playlists
              </Button>
            </Link>
            <Link href={`/actors/${actorId}`} passHref>
              <Button
                size="sm"
                variant={isMarkersPage ? "solid" : "soft"}
              >
                Markers
              </Button>
            </Link>
            <Link href={`/actors/${actorId}/scenes`} passHref>
              <Button
                size="sm"
                variant={isScenesPage ? "solid" : "soft"}
              >
                Scenes
              </Button>
            </Link>
          </Box>
          {!anyLoading && allScenes.length > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography level="body-sm" color="neutral">
                {isFiltering 
                  ? (scenes.length === allScenes.length 
                      ? `${scenes.length} marker${scenes.length === 1 ? '' : 's'}`
                      : `${scenes.length} of ${allScenes.length} markers`)
                  : `Page ${pageNumber} • ${allScenes.length} marker${allScenes.length === 1 ? '' : 's'}`
                }
              </Typography>
            </Box>
          )}
        </Box>

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
            placeholder="Search markers..."
            value={searchQuery}
            onChange={(e) => {
              const newValue = e.target.value;
              setSearchQuery(newValue);
              setPageNumber(1); // Reset to first page on search
              updateURLWithFilters(undefined, newValue, undefined, 1);
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
                    updateURLWithFilters(undefined, "", undefined, 1);
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
        
        {/* Only show sorting when filtering (not when paginating) */}
        {isFiltering && (
          <FormControl sx={{ minWidth: { xs: "100%", lg: 180 } }}>
            <Select
              value={sortOption}
              onChange={(_, value) => {
                const newSort = value as SortOption;
                setSortOption(newSort);
                updateURLWithFilters(undefined, undefined, newSort);
              }}
              startDecorator={<ArrowUpDown size={16} />}
              size="sm"
            >
              <Option value="title-asc">Title (A-Z)</Option>
              <Option value="title-desc">Title (Z-A)</Option>
              <Option value="duration-asc">Shortest First</Option>
              <Option value="duration-desc">Longest First</Option>
              <Option value="rating-desc">Highest Rated</Option>
              <Option value="rating-asc">Lowest Rated</Option>
            </Select>
          </FormControl>
        )}

        <FormControl sx={{ flexGrow: 2, minWidth: { xs: "100%", lg: 250 } }}>
          <Autocomplete
            placeholder="Filter by tags..."
            multiple
            options={tagOptions}
            value={selectedTagOptions}
            onChange={(_e, val) => {
              const newTagIds = val.map(v => v.id);
              setSelectedTagIds(newTagIds);
              setPageNumber(1); // Reset to first page on filter change
              updateURLWithFilters(newTagIds, undefined, undefined, 1);
            }}
            getOptionLabel={(o) => (typeof o === "string" ? o : o.label)}
            isOptionEqualToValue={(a, b) => a?.id === b?.id}
            size="sm"
          />
        </FormControl>

        <Button
          size="sm"
          variant="plain"
          disabled={selectedTagIds.length === 0}
          onClick={() => {
            setSelectedTagIds([]);
            setPageNumber(1);
            updateURLWithFilters([], undefined, undefined, 1);
          }}
          sx={{ minWidth: "auto" }}
        >
          Clear tags
        </Button>
      </Stack>

      {/* Selection Mode Toolbar */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{
          mb: 2,
          p: 1,
          borderRadius: "md",
          bgcolor: isSelectionMode ? "background.level1" : "transparent",
          border: isSelectionMode ? "1px solid" : "1px solid transparent",
          borderColor: isSelectionMode ? "neutral.outlinedBorder" : "transparent",
          transition: "all 0.2s ease",
          width: "fit-content",
        }}
      >
        <Button
          size="sm"
          variant={isSelectionMode ? "solid" : "soft"}
          color={isSelectionMode ? "primary" : "neutral"}
          startDecorator={isSelectionMode ? <CheckSquare size={16} /> : <Square size={16} />}
          onClick={() => {
            setIsSelectionMode(!isSelectionMode);
            if (isSelectionMode) {
              clearSelection();
            }
          }}
        >
          {isSelectionMode ? "Exit Selection" : "Select Clips To Export"}
        </Button>

        {isSelectionMode && (
          <>
            <Chip
              size="sm"
              variant="soft"
              color={selectedMarkerIds.size > 0 ? "primary" : "neutral"}
            >
              {selectedMarkerIds.size} selected
            </Chip>

            <Button
              size="sm"
              variant="soft"
              color="primary"
              onClick={selectAllVisible}
              disabled={scenes.length === 0}
            >
              Select All
            </Button>

            <Button
              size="sm"
              variant="solid"
              color="danger"
              onClick={clearSelection}
              disabled={selectedMarkerIds.size === 0}
            >
              Clear
            </Button>

            <Box sx={{ width: 16 }} />

            <Button
              size="sm"
              variant="solid"
              color="success"
              startDecorator={<Film size={16} />}
              disabled={selectedMarkerIds.size === 0}
              onClick={() => setFfmpegDialogOpen(true)}
            >
              Generate FFmpeg
            </Button>
          </>
        )}
      </Stack>

      {/* Top Pagination Controls - only show when not filtering */}
      {!isFiltering && !anyLoading && (
        <PaginationControls 
          pageNumber={pageNumber}
          perPage={perPage}
          totalCount={totalCount}
          onPageChange={(newPage) => {
            setPageNumber(newPage);
            updateURLWithFilters(undefined, undefined, undefined, newPage);
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

      {!anyLoading && (error || tagsError || playlistsError) && (
        <Typography color="danger" level="body-sm" sx={{ mb: 2 }}>
          {error?.message || (tagsError instanceof Error ? tagsError.message : tagsError) || playlistsError}
        </Typography>
      )}

      {/* Empty state */}
      {!anyLoading && allScenes.length === 0 && (
        <Sheet
          variant="soft"
          color="neutral"
          sx={{ p: 3, borderRadius: "lg", textAlign: "center" }}
        >
          <Typography level="title-md">No clips found.</Typography>
        </Sheet>
      )}

      {/* No results after filtering */}
      {!anyLoading && allScenes.length > 0 && scenes.length === 0 && (
        <Sheet
          variant="soft"
          color="neutral"
          sx={{ p: 3, borderRadius: "lg", textAlign: "center" }}
        >
          <Typography level="title-md">No markers match your search or filters.</Typography>
          <Typography level="body-sm" sx={{ mt: 1 }}>
            Try adjusting your search terms or clearing filters.
          </Typography>
          {(searchQuery || selectedTagIds.length > 0) && (
            <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2 }}>
              {searchQuery && (
                <Button variant="plain" size="sm" onClick={() => {
                  setSearchQuery("");
                  setPageNumber(1);
                  updateURLWithFilters(undefined, "", undefined, 1);
                }}>
                  Clear search
                </Button>
              )}
              {selectedTagIds.length > 0 && (
                <Button variant="plain" size="sm" onClick={() => {
                  setSelectedTagIds([]);
                  setPageNumber(1);
                  updateURLWithFilters([], undefined, undefined, 1);
                }}>
                  Clear tags
                </Button>
              )}
            </Stack>
          )}
        </Sheet>
      )}


      {/* Scene Cards */}
      {!anyLoading && scenes.length > 0 && (
        <>
          <Grid container spacing={2}>
            {scenes.map((marker: any) => {
              const rating = ratings[marker.id];
              return (
                <Grid key={marker.id} xs={12} sm={6} md={4} lg={3} xl={2}>
                  <Card
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (isSelectionMode) {
                          toggleMarkerSelection(marker.id);
                        } else {
                          router.push(`/scenes/${marker.scene.id}`);
                        }
                      }
                    }}
                    sx={{
                      p: 0,
                      overflow: "hidden",
                      borderRadius: "lg",
                      position: "relative",
                      boxShadow: "sm",
                      transition: "transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease",
                      border: selectedMarkerIds.has(marker.id) ? "3px solid" : "2px solid transparent",
                      borderColor: selectedMarkerIds.has(marker.id) ? "success.400" : "transparent",
                      "&:hover": {
                        transform: "translateY(-2px)",
                        boxShadow: "md",
                        borderColor: selectedMarkerIds.has(marker.id) ? "success.500" : "primary.200",
                      },
                      "&:focus": {
                        outline: "2px solid",
                        outlineColor: "primary.500",
                        outlineOffset: "2px",
                      },
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      if (isSelectionMode) {
                        toggleMarkerSelection(marker.id);
                      } else {
                        router.push(`/scenes/${marker.scene.id}`);
                      }
                    }}
                  >
                    <AspectRatio ratio="16/9">
                      {/* Media (screenshot -> preview on hover) */}
                      <CardCover 
                        sx={{ 
                          pointerEvents: "auto",
                        }}
                      >
                        <HoverPreview
                          screenshot={marker.screenshot}
                          preview={marker.preview}
                          alt={marker.title}
                          stashBase={String(stashServer || "")}
                          apiKey={String(stashAPI || "")}
                        />
                      </CardCover>

                      {/* Rating display (top-right) */}
                      {rating && (
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
                            display: "flex",
                            alignItems: "center",
                            gap: 0.25,
                          }}
                        >
                          <StarRating 
                            value={rating} 
                            readonly={true} 
                            size="sm"
                            showClearButton={false}
                          />
                        </Box>
                      )}

                      {/* Selection checkbox or Add to playlist button (top-left) */}
                      <Box
                        sx={{
                          position: "absolute",
                          top: 8,
                          left: 8,
                          zIndex: 2,
                        }}
                      >
                        {isSelectionMode ? (
                          <Checkbox
                            checked={selectedMarkerIds.has(marker.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleMarkerSelection(marker.id);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            size="lg"
                            sx={{
                              bgcolor: "rgba(255, 255, 255, 0.9)",
                              borderRadius: "sm",
                              backdropFilter: "blur(4px)",
                              "&:hover": {
                                bgcolor: "rgba(255, 255, 255, 1)",
                              },
                            }}
                          />
                        ) : (
                          <IconButton
                            size="sm"
                            variant="solid"
                            color="primary"
                            onClick={(e) => handleAddSingleToPlaylist(marker, e)}
                            sx={{
                              backgroundColor: "rgba(25, 118, 210, 0.9)",
                              backdropFilter: "blur(4px)",
                              border: "1px solid rgba(255, 255, 255, 0.2)",
                              "&:hover": {
                                backgroundColor: "rgba(25, 118, 210, 1)",
                                transform: "scale(1.05)",
                              },
                              transition: "all 150ms ease",
                            }}
                            title="Add to playlist"
                          >
                            <Plus size={16} />
                          </IconButton>
                        )}
                      </Box>

                      {/* Bottom gradient + title/time */}
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
                          title={marker.title}
                        >
                          {marker.title}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: "#fff" }}>
                          {formatLength(marker.end_seconds - marker.seconds)}
                        </Typography>
                      </Box>
                    </AspectRatio>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}

      {/* Bottom Pagination Controls - only show when not filtering */}
      {!isFiltering && !anyLoading && allScenes.length > 0 && (
        <PaginationControls 
          pageNumber={pageNumber}
          perPage={perPage}
          totalCount={totalCount}
          onPageChange={(newPage) => {
            setPageNumber(newPage);
            updateURLWithFilters(undefined, undefined, undefined, newPage);
          }}
          sx={{ mt: 3 }}
        />
      )}

      {/* Single Marker Add to Playlist Dialog */}
      <Modal open={isSingleDialogOpen} onClose={() => setIsSingleDialogOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <DialogTitle>Add to Playlist</DialogTitle>
          <DialogContent>
            <Typography level="body-sm" sx={{ mb: 1 }}>
              Add "{singleMarker?.title}" to a manual playlist.
            </Typography>

            <Autocomplete
              placeholder="Choose playlist…"
              options={manualPlaylists.map((pl) => ({ id: pl.id, label: pl.name }))}
              value={
                singlePlaylistId
                  ? {
                    id: singlePlaylistId,
                    label: manualPlaylists.find((p) => p.id === singlePlaylistId)?.name ?? "",
                  }
                  : null
              }
              onChange={(_e, val) => setSinglePlaylistId(val?.id ?? "")}
              getOptionLabel={(o) => (typeof o === "string" ? o : o.label)}
              isOptionEqualToValue={(a, b) => a?.id === b?.id}
              size="sm"
              sx={{ width: "100%", mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button variant="plain" onClick={() => setIsSingleDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!singlePlaylistId} onClick={confirmSingleAdd}>
              Add to Playlist
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>

      {/* FFmpeg Clip Generator Dialog */}
      <FFmpegClipGenerator
        open={ffmpegDialogOpen}
        onClose={() => setFfmpegDialogOpen(false)}
        markers={selectedMarkers}
        stashServer={String(stashServer || "")}
        stashApiKey={String(stashAPI || "")}
      />
    </Sheet>
  );
}
