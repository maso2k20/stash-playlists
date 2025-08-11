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
} from "@mui/joy";

const GET_ALL_MARKERS = gql`
  query findActorsSceneMarkers($actorId: ID!, $tagID: [ID!]!, $pageNumber: Int, $perPage: Int) {
    findSceneMarkers(
      scene_marker_filter: {
        performers: { modifier: INCLUDES, value: [$actorId] }
        tags: { modifier: INCLUDES, value: $tagID }
      }
      filter: { page: $pageNumber, per_page: $perPage }
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

  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  const pathname = usePathname();
  const isMarkersPage = !pathname?.includes("/scenes");

  const settings = useSettings();
  const stashServer = settings["STASH_SERVER"];
  const stashAPI = settings["STASH_API"];

  const { stashTags, loading: tagsLoading, error: tagsError } = useStashTags();

  // Pagination state
  const [pageNumber, setPageNumber] = useState(1);
  const perPage = 60;

  // Reset page to 1 whenever tag filter changes
  useEffect(() => {
    setPageNumber(1);
  }, [selectedTagId]);

  // Smooth-scroll to top on page change
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [pageNumber]);

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

  // Tag options (no manual filtering; let Joy Autocomplete filter by label)
  const tagOptions = useMemo(
    () => (stashTags || []).map((t: any) => ({ id: String(t.id), label: t.name as string })),
    [stashTags]
  );
  const selectedTagOption =
    selectedTagId ? tagOptions.find((t: any) => t.id === selectedTagId) ?? null : null;

  // Query markers with either the chosen tag or all available tags
  const tagIDsForFilter = selectedTagId
    ? [selectedTagId]
    : (stashTags || []).map((tag: any) => String(tag.id));

  const { data, loading, error } = useQuery(GET_ALL_MARKERS, {
    variables: { actorId, tagID: tagIDsForFilter, pageNumber, perPage },
    fetchPolicy: "cache-and-network",
  });

  const scenes = data?.findSceneMarkers?.scene_markers ?? [];

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

  // Simple "has next page" heuristic: if we got fewer than perPage, it's the last page
  const hasNextPage = scenes.length === perPage;
  const hasPrevPage = pageNumber > 1;

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
              component="a"
            >
              Markers
            </Button>
          </Link>
          <Link href={`/actors/${actorId}/scenes`} passHref>
            <Button
              size="sm"
              variant={isMarkersPage ? "soft" : "solid"}
              component="a"
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

      {/* Filters row */}
      <Box
        sx={{
          display: "flex",
          gap: 1,
          alignItems: "center",
          flexWrap: "wrap",
          mb: 2,
        }}
      >
        <Autocomplete
          placeholder="Filter by tag…"
          options={tagOptions}
          value={selectedTagOption}
          onChange={(_e, val) => setSelectedTagId(val?.id ?? null)}
          getOptionLabel={(o) => (typeof o === "string" ? o : o.label)}
          isOptionEqualToValue={(a, b) => a?.id === b?.id}
          size="sm"
          sx={{ minWidth: { xs: 220, sm: 300 }, flexGrow: 1 }}
        />
        <Button
          size="sm"
          variant="plain"
          disabled={!selectedTagId}
          onClick={() => setSelectedTagId(null)}
        >
          Reset tag
        </Button>
      </Box>

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
      {!anyLoading && scenes.length === 0 && (
        <Sheet
          variant="soft"
          color="neutral"
          sx={{ p: 3, borderRadius: "lg", textAlign: "center" }}
        >
          <Typography level="title-md">No clips found.</Typography>
        </Sheet>
      )}

      {/* Scene Cards */}
      {!anyLoading && scenes.length > 0 && (
        <>
          <Grid container spacing={2}>
            {scenes.map((marker: any) => {
              const checked = selectedMarkers.includes(marker.id);
              return (
                <Grid key={marker.id} xs={12} sm={6} md={4} lg={3} xl={2}>
                  <Card
                    sx={{
                      p: 0,
                      overflow: "hidden",
                      borderRadius: "lg",
                      position: "relative",
                      boxShadow: "sm",
                      transition: "transform 150ms ease, box-shadow 150ms ease",
                      "&:hover": { transform: "translateY(-2px)", boxShadow: "md" },
                    }}
                  >
                    <AspectRatio ratio="16/9">
                      {/* Media (screenshot -> preview on hover) */}
                      <CardCover sx={{ pointerEvents: "auto" }}>
                        <HoverPreview
                          screenshot={marker.screenshot}
                          preview={marker.preview}
                          alt={marker.title}
                          stashBase={stashServer}
                          apiKey={stashAPI}
                        />
                      </CardCover>

                      {/* Checkbox (top-right) */}
                      <Box sx={{ position: "absolute", top: 8, right: 8 }}>
                        <Checkbox
                          checked={checked}
                          onChange={() => toggleMarker(marker.id)}
                          size="sm"
                          variant="soft"
                        />
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

          {/* Pagination controls */}
          <Box
            sx={{
              mt: 2,
              display: "flex",
              alignItems: "center",
              gap: 1,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Button
              size="sm"
              variant="outlined"
              disabled={!hasPrevPage || loading}
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>

            <Chip size="sm" variant="soft">
              Page {pageNumber}
            </Chip>

            <Button
              size="sm"
              variant="outlined"
              disabled={!hasNextPage || loading}
              onClick={() => setPageNumber((p) => p + 1)}
            >
              Next
            </Button>
          </Box>
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
