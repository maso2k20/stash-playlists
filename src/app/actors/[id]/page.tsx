// src/app/actors/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, gql } from "@apollo/client";
import { useParams } from "next/navigation";
import { useSettings } from "@/app/context/SettingsContext";
import { useStashTags } from "@/context/StashTagsContext";
import { formatLength } from "@/lib/formatLength";
import { usePathname } from "next/navigation";
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
  Checkbox,
  Autocomplete,
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

import { Search, ArrowUpDown } from "lucide-react";

import StarRating from "@/components/StarRating";

const GET_ALL_MARKERS = gql`
  query findActorsSceneMarkers($actorId: ID!, $tagID: [ID!]!) {
    findSceneMarkers(
      scene_marker_filter: {
        performers: { modifier: INCLUDES, value: [$actorId] }
        tags: { modifier: INCLUDES, value: $tagID }
      }
      filter: { per_page: -1 }
    ) {
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

  const resolvedPreview = withApiKey(joinUrl(stashBase, preview ?? ""), apiKey);
  const resolvedShot = withApiKey(joinUrl(stashBase, screenshot ?? ""), apiKey);

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
  const actorId = params.id;

  const [selectedMarkers, setSelectedMarkers] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [playlistsError, setPlaylistsError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [chosenPlaylistId, setChosenPlaylistId] = useState<string>("");

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("title-asc");

  const pathname = usePathname();
  const isMarkersPage = !pathname?.includes("/scenes");

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
    tagOptions.find(t => t.id === id)
  ).filter(Boolean);

  // Query markers with either the chosen tags or all available tags
  const tagIDsForFilter = selectedTagIds.length > 0
    ? selectedTagIds
    : (stashTags || []).map((tag: any) => String(tag.id));

  const { data, loading, error } = useQuery(GET_ALL_MARKERS, {
    variables: { actorId, tagID: tagIDsForFilter },
    fetchPolicy: "cache-and-network",
  });

  const allScenes = data?.findSceneMarkers?.scene_markers ?? [];

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

  // Fetch ratings for current markers (use allScenes to avoid dependency loop)
  useEffect(() => {
    if (allScenes.length === 0) return;
    
    const markerIds = allScenes.map((marker: any) => marker.id);
    const idsParam = markerIds.join(',');
    
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

  const toggleMarker = (markerId: string) => {
    setSelectedMarkers((prev) =>
      prev.includes(markerId) ? prev.filter((m) => m !== markerId) : [...prev, markerId]
    );
  };

  const manualPlaylists = useMemo(
    () => playlists.filter((pl) => pl.type === "MANUAL"),
    [playlists]
  );

  const confirmAdd = async () => {
    const items = selectedMarkers
      .map((mId) => {
        const marker = scenes.find((m: any) => m.id === mId);
        if (!marker) return null;

        const preview = marker.preview ?? marker.screenshot ?? null;

        return {
          id: marker.id,
          title: marker.title,
          startTime: marker.seconds,
          endTime: marker.end_seconds,
          screenshot: marker.screenshot,
          stream: `${stashServer}/scene/${marker.scene.id}/stream?api_key=${stashAPI}`,
          preview,
        };
      })
      .filter(Boolean);

    try {
      const res = await fetch(`/api/playlists/${chosenPlaylistId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Add-to-playlist failed:", result);
      } else {
        setSelectedMarkers([]);
        setChosenPlaylistId("");
        setIsDialogOpen(false);
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

        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexGrow: 1 }}>
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
              variant={isMarkersPage ? "soft" : "solid"}
            >
              Scenes
            </Button>
          </Link>
        </Box>

        {/* Selected count */}
        {selectedMarkers.length > 0 && (
          <Chip color="primary" variant="solid" size="sm">
            {selectedMarkers.length} selected
          </Chip>
        )}

        {/* Add to playlist (opens dialog) */}
        <Button
          size="sm"
          disabled={selectedMarkers.length === 0}
          onClick={() => setIsDialogOpen(true)}
        >
          Add to Playlist
        </Button>

        {/* Clear selection */}
        <Button
          size="sm"
          variant="plain"
          disabled={selectedMarkers.length === 0}
          onClick={() => setSelectedMarkers([])}
        >
          Clear
        </Button>
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
            onChange={(e) => setSearchQuery(e.target.value)}
            startDecorator={<Search size={16} />}
            endDecorator={
              searchQuery && (
                <IconButton
                  size="sm"
                  variant="plain"
                  onClick={() => setSearchQuery("")}
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
            onChange={(_, value) => setSortOption(value as SortOption)}
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

        <FormControl sx={{ flexGrow: 2, minWidth: { xs: "100%", lg: 250 } }}>
          <Autocomplete
            placeholder="Filter by tags..."
            multiple
            options={tagOptions}
            value={selectedTagOptions}
            onChange={(_e, val) => setSelectedTagIds(val.map(v => v.id))}
            getOptionLabel={(o) => (typeof o === "string" ? o : o.label)}
            isOptionEqualToValue={(a, b) => a?.id === b?.id}
            size="sm"
          />
        </FormControl>

        <Button
          size="sm"
          variant="plain"
          disabled={selectedTagIds.length === 0}
          onClick={() => setSelectedTagIds([])}
          sx={{ minWidth: "auto" }}
        >
          Clear tags
        </Button>
      </Stack>

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
          {error?.message || tagsError || playlistsError}
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
                <Button variant="plain" size="sm" onClick={() => setSearchQuery("")}>
                  Clear search
                </Button>
              )}
              {selectedTagIds.length > 0 && (
                <Button variant="plain" size="sm" onClick={() => setSelectedTagIds([])}>
                  Clear tags
                </Button>
              )}
            </Stack>
          )}
        </Sheet>
      )}

      {/* Results count */}
      {!anyLoading && allScenes.length > 0 && (
        <Box sx={{ mb: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography level="body-sm" color="neutral">
            {scenes.length === allScenes.length 
              ? `${scenes.length} marker${scenes.length === 1 ? '' : 's'}`
              : `${scenes.length} of ${allScenes.length} markers`
            }
          </Typography>
          {loading && (
            <Typography level="body-xs" color="neutral">
              Loading...
            </Typography>
          )}
        </Box>
      )}

      {/* Scene Cards */}
      {!anyLoading && scenes.length > 0 && (
        <>
          <Grid container spacing={2}>
            {scenes.map((marker: any) => {
              const checked = selectedMarkers.includes(marker.id);
              const rating = ratings[marker.id];
              return (
                <Grid key={marker.id} xs={12} sm={6} md={4} lg={3} xl={2}>
                  <Card
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleMarker(marker.id);
                      }
                    }}
                    sx={{
                      p: 0,
                      overflow: "hidden",
                      borderRadius: "lg",
                      position: "relative",
                      boxShadow: "sm",
                      transition: "transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease",
                      border: checked ? "2px solid" : "2px solid transparent",
                      borderColor: checked ? "primary.500" : "transparent",
                      "&:hover": { 
                        transform: "translateY(-2px)", 
                        boxShadow: "md",
                        borderColor: checked ? "primary.600" : "neutral.300",
                      },
                      "&:focus": {
                        outline: "2px solid",
                        outlineColor: "primary.500",
                        outlineOffset: "2px",
                      },
                      cursor: "pointer",
                    }}
                    onClick={() => toggleMarker(marker.id)}
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
                          stashBase={stashServer}
                          apiKey={stashAPI}
                        />
                        
                        {/* Selected overlay */}
                        {checked && (
                          <Box
                            sx={{
                              position: "absolute",
                              inset: 0,
                              backgroundColor: "rgba(25, 118, 210, 0.2)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              pointerEvents: "none",
                            }}
                          >
                            <Box
                              sx={{
                                backgroundColor: "primary.500",
                                borderRadius: "50%",
                                p: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="white"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20,6 9,17 4,12"></polyline>
                              </svg>
                            </Box>
                          </Box>
                        )}
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

      {/* Add to Playlist Dialog */}
      <Modal open={isDialogOpen} onClose={() => setIsDialogOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <DialogTitle>Select Playlist</DialogTitle>
          <DialogContent>
            <Typography level="body-sm" sx={{ mb: 1 }}>
              Choose a manual playlist to add {selectedMarkers.length} item
              {selectedMarkers.length === 1 ? "" : "s"}.
            </Typography>

            <Autocomplete
              placeholder="Choose playlist…"
              options={manualPlaylists.map((pl) => ({ id: pl.id, label: pl.name }))}
              value={
                chosenPlaylistId
                  ? {
                    id: chosenPlaylistId,
                    label: manualPlaylists.find((p) => p.id === chosenPlaylistId)?.name ?? "",
                  }
                  : null
              }
              onChange={(_e, val) => setChosenPlaylistId(val?.id ?? "")}
              getOptionLabel={(o) => (typeof o === "string" ? o : o.label)}
              isOptionEqualToValue={(a, b) => a?.id === b?.id}
              size="sm"
              sx={{ width: "100%", mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button variant="plain" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!chosenPlaylistId} onClick={confirmAdd}>
              Confirm
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </Sheet>
  );
}
