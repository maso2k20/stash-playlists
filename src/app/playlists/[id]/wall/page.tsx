// src/app/playlists/[id]/wall/page.tsx
"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, gql } from "@apollo/client";
import {
  Box,
  Button,
  Chip,
  Container,
  Grid,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/joy";
import {
  ArrowLeft,
  Pause,
  Play,
  Maximize2,
  Minimize2,
} from "lucide-react";
import VideoWallQuadrant from "@/components/VideoWallQuadrant";
import VideoWallMarkerCard from "@/components/VideoWallMarkerCard";
import { useSettings } from "@/app/context/SettingsContext";

// GraphQL queries and mutations for marker tag editing
const GET_SCENE_MARKER_DETAILS = gql`
  query getSceneMarkerDetails($id: ID!) {
    findScene(id: $id) {
      id
      scene_markers {
        id
        title
        seconds
        end_seconds
        primary_tag { id name }
        tags { id name }
      }
    }
  }
`;

const UPDATE_SCENE_MARKER = gql`
  mutation updateSceneMarker($input: SceneMarkerUpdateInput!) {
    sceneMarkerUpdate(input: $input) {
      id
      title
      seconds
      end_seconds
      primary_tag { id name }
      tags { id name }
    }
  }
`;

type PlaylistItem = {
  id: string;
  item: {
    id: string;
    stream: string;
    title: string;
    startTime: number;
    endTime: number;
    screenshot?: string;
    rating?: number | null;
  };
};

type Playlist = {
  id: string;
  name: string;
  items: PlaylistItem[];
};

type MarkerDetails = {
  id: string;
  title: string;
  seconds: number;
  end_seconds: number | null;
  primary_tag: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string }>;
};

type SceneMarkerDetailsData = {
  findScene: {
    id: string;
    scene_markers: MarkerDetails[];
  } | null;
};

// Fisher-Yates shuffle algorithm
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Extract scene ID from stream URL
const extractSceneId = (stream: string | undefined): string | null => {
  if (!stream) return null;
  const match = stream.match(/\/scene\/([^\/]+)\/stream/);
  return match ? match[1] : null;
};

export default function VideoWallPage() {
  const { id } = useParams();
  const router = useRouter();
  const settings = useSettings();

  // Playlist state
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);

  // Shuffled queue - all items in random order
  const [shuffledItems, setShuffledItems] = useState<PlaylistItem[]>([]);

  // Current items for each quadrant (0-3)
  const [quadrantItems, setQuadrantItems] = useState<(PlaylistItem | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  // Next index to pull from the shuffled queue
  const nextIndexRef = useRef(4); // Start at 4 since 0-3 are initial items

  // Audio state - which quadrant is unmuted (null = all muted)
  const [unmutedQuadrant, setUnmutedQuadrant] = useState<number | null>(null);

  // Pause state
  const [isPaused, setIsPaused] = useState(false);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wallContainerRef = useRef<HTMLDivElement>(null);

  // Marker details cache by marker ID
  const [markerDetailsCache, setMarkerDetailsCache] = useState<
    Record<string, MarkerDetails>
  >({});
  const [loadingMarkers, setLoadingMarkers] = useState<Record<string, boolean>>(
    {}
  );

  // GraphQL mutation for tags
  const [updateSceneMarker] = useMutation(UPDATE_SCENE_MARKER);

  // Stash server settings
  const stashServer = String(settings["STASH_SERVER"] || "");
  const stashApiKey = String(settings["STASH_API"] || "");

  // Fetch playlist
  useEffect(() => {
    const fetchPlaylist = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/playlists?id=${id}`);
        if (!res.ok) throw new Error("Failed to fetch playlist");
        const data = await res.json();
        setPlaylist(data);
      } catch (error) {
        console.error("Failed to fetch playlist:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPlaylist();
  }, [id]);

  // Redirect if playlist has less than 4 items
  useEffect(() => {
    if (!loading && playlist) {
      if (playlist.items.length < 4) {
        router.replace(`/playlists/${id}`);
      }
    }
  }, [loading, playlist, id, router]);

  // Initialize shuffled items and quadrants
  useEffect(() => {
    if (!playlist || playlist.items.length < 4) return;

    const shuffled = shuffleArray(playlist.items);
    setShuffledItems(shuffled);

    // Assign first 4 items to quadrants
    setQuadrantItems([shuffled[0], shuffled[1], shuffled[2], shuffled[3]]);
    nextIndexRef.current = 4;
  }, [playlist]);

  // Fetch marker details for a scene
  const fetchMarkerDetails = useCallback(
    async (sceneId: string, markerId: string) => {
      if (markerDetailsCache[markerId]) return;

      setLoadingMarkers((prev) => ({ ...prev, [markerId]: true }));

      try {
        const res = await fetch("/api/stash-graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `
            query getSceneMarkerDetails($id: ID!) {
              findScene(id: $id) {
                id
                scene_markers {
                  id
                  title
                  seconds
                  end_seconds
                  primary_tag { id name }
                  tags { id name }
                }
              }
            }
          `,
            variables: { id: sceneId },
          }),
        });

        const data = await res.json();
        if (data.data?.findScene?.scene_markers) {
          const markers = data.data.findScene.scene_markers;
          const marker = markers.find((m: MarkerDetails) => m.id === markerId);
          if (marker) {
            setMarkerDetailsCache((prev) => ({ ...prev, [markerId]: marker }));
          }
        }
      } catch (error) {
        console.error("Failed to fetch marker details:", error);
      } finally {
        setLoadingMarkers((prev) => ({ ...prev, [markerId]: false }));
      }
    },
    [markerDetailsCache]
  );

  // Fetch marker details for all current quadrant items
  useEffect(() => {
    quadrantItems.forEach((item) => {
      if (item) {
        const sceneId = extractSceneId(item.item.stream);
        if (sceneId) {
          fetchMarkerDetails(sceneId, item.item.id);
        }
      }
    });
  }, [quadrantItems, fetchMarkerDetails]);

  // Handle when a quadrant video ends
  const handleQuadrantEnded = useCallback(
    (quadrantIndex: number) => {
      if (shuffledItems.length === 0) return;

      setQuadrantItems((prev) => {
        const next = [...prev];
        const nextItem =
          shuffledItems[nextIndexRef.current % shuffledItems.length];
        nextIndexRef.current++;
        next[quadrantIndex] = nextItem;
        return next;
      });
    },
    [shuffledItems]
  );

  // Handle mute toggle - clicking a quadrant unmutes it and mutes others
  const handleMuteToggle = useCallback((quadrantIndex: number) => {
    setUnmutedQuadrant((prev) =>
      prev === quadrantIndex ? null : quadrantIndex
    );
  }, []);

  // Toggle pause all
  const togglePauseAll = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!wallContainerRef.current) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wallContainerRef.current.requestFullscreen();
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Handle rating changes
  const handleRatingChange = useCallback(
    async (itemId: string, rating: number | null) => {
      try {
        const response = await fetch(`/api/items/${itemId}/rating`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating }),
        });

        if (!response.ok) throw new Error("Failed to update rating");

        // Update local state
        setQuadrantItems((prev) =>
          prev.map((item) => {
            if (item && item.item.id === itemId) {
              return { ...item, item: { ...item.item, rating } };
            }
            return item;
          })
        );

        // Also update shuffled items
        setShuffledItems((prev) =>
          prev.map((item) => {
            if (item.item.id === itemId) {
              return { ...item, item: { ...item.item, rating } };
            }
            return item;
          })
        );
      } catch (error) {
        console.error("Failed to update rating:", error);
      }
    },
    []
  );

  // Handle tag save
  const handleTagSave = useCallback(
    async (markerId: string, primaryTagId: string | null, tagIds: string[]) => {
      try {
        const result = await updateSceneMarker({
          variables: {
            input: {
              id: markerId,
              primary_tag_id: primaryTagId,
              tag_ids: tagIds,
            },
          },
        });

        // Update cache with new marker data
        if (result.data?.sceneMarkerUpdate) {
          setMarkerDetailsCache((prev) => ({
            ...prev,
            [markerId]: result.data.sceneMarkerUpdate,
          }));
        }
      } catch (error) {
        console.error("Failed to update marker tags:", error);
        throw error;
      }
    },
    [updateSceneMarker]
  );

  // Loading state
  if (loading) {
    return (
      <Container
        maxWidth={false}
        sx={{
          py: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
        }}
      >
        <Typography level="h4">Loading playlist...</Typography>
      </Container>
    );
  }

  // Redirect handled in useEffect, show nothing while redirecting
  if (!playlist || playlist.items.length < 4) {
    return null;
  }

  return (
    <Container
      maxWidth={false}
      sx={{
        py: 2,
        px: { xs: 1, sm: 2 },
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2, flexShrink: 0 }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <Tooltip title="Back to playlists">
            <IconButton
              variant="soft"
              onClick={() => router.push("/playlists")}
            >
              <ArrowLeft size={20} />
            </IconButton>
          </Tooltip>
          <Typography level="h4" noWrap sx={{ maxWidth: 400 }}>
            {playlist.name}
          </Typography>
          <Chip size="sm" variant="soft" color="primary">
            Wall Mode
          </Chip>
        </Stack>

        <Stack direction="row" spacing={1}>
          <Tooltip title={isPaused ? "Play all" : "Pause all"}>
            <IconButton variant="soft" onClick={togglePauseAll}>
              {isPaused ? <Play size={20} /> : <Pause size={20} />}
            </IconButton>
          </Tooltip>
          <Tooltip title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            <IconButton variant="soft" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Video Wall Container */}
      <Box
        ref={wallContainerRef}
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          bgcolor: isFullscreen ? "black" : "transparent",
        }}
      >
        {/* 2x2 Video Grid */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            gap: isFullscreen ? 0.5 : 0.5,
            flex: isFullscreen ? 1 : "0 0 auto",
            height: isFullscreen ? "100%" : "calc(100vh - 250px)",
            minHeight: 400,
          }}
        >
          {[0, 1, 2, 3].map((quadrantIndex) => (
            <Box key={quadrantIndex} sx={{ position: "relative", minHeight: 0 }}>
              <VideoWallQuadrant
                item={quadrantItems[quadrantIndex]}
                quadrantIndex={quadrantIndex}
                isMuted={unmutedQuadrant !== quadrantIndex}
                onMuteToggle={() => handleMuteToggle(quadrantIndex)}
                onSkip={() => handleQuadrantEnded(quadrantIndex)}
                onEnded={() => handleQuadrantEnded(quadrantIndex)}
                isPaused={isPaused}
                stashServer={stashServer}
                stashApiKey={stashApiKey}
              />
            </Box>
          ))}
        </Box>

        {/* Marker Info Grid - hide in fullscreen */}
        {!isFullscreen && (
          <Grid container spacing={1} sx={{ mt: 2, flexShrink: 0 }}>
            {[0, 1, 2, 3].map((quadrantIndex) => {
              const item = quadrantItems[quadrantIndex];
              const markerDetails = item
                ? markerDetailsCache[item.item.id]
                : null;
              const isLoading = item
                ? loadingMarkers[item.item.id]
                : false;

              return (
                <Grid key={quadrantIndex} xs={6} md={3}>
                  <VideoWallMarkerCard
                    item={item}
                    quadrantIndex={quadrantIndex}
                    markerDetails={markerDetails || null}
                    markerLoading={isLoading}
                    onRatingChange={handleRatingChange}
                    onTagSave={handleTagSave}
                  />
                </Grid>
              );
            })}
          </Grid>
        )}
      </Box>
    </Container>
  );
}
