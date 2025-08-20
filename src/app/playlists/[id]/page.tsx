'use client'
import * as React from 'react';
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useMutation, gql } from "@apollo/client";
import { Grid, Container, Sheet, Box, Typography, Button } from '@mui/joy';
import VideoJS from "@/components/videojs/VideoJS";
import { PlaylistDetail } from '@/components/PlaylistDetail';
import StarRating from '@/components/StarRating';
import MarkerTagEditor from '@/components/MarkerTagEditor';

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
  name: string;
  items: PlaylistItem[];
};

export default function PlaylistPlayer() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0); // index within playOrder
  const [hasStarted, setHasStarted] = useState(false);

  // NEW: order of indices into `items` used for playback (so shuffle affects play)
  const [playOrder, setPlayOrder] = useState<number[]>([]);
  
  // Track which items have been played (by their original index in items array)
  const [playedItemIndices, setPlayedItemIndices] = useState<Set<number>>(new Set());

  const playerRef = useRef<any>(null);

  // Tag editing state
  const [currentMarkerDetails, setCurrentMarkerDetails] = useState<any>(null);

  // GraphQL hooks for marker tag editing
  const [updateSceneMarker] = useMutation(UPDATE_SCENE_MARKER);

  // Handle rating changes
  const handleRatingChange = useCallback(async (itemId: string, rating: number | null) => {
    try {
      const response = await fetch(`/api/items/${itemId}/rating`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rating }),
      });

      if (!response.ok) {
        throw new Error('Failed to update rating');
      }

      await response.json();
      
      // Update local state
      setPlaylist(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(playlistItem => 
            playlistItem.item.id === itemId
              ? { ...playlistItem, item: { ...playlistItem.item, rating } }
              : playlistItem
          ),
        };
      });
    } catch (error) {
      console.error('Failed to update rating:', error);
    }
  }, []);

  // Fetch playlist
  useEffect(() => {
    fetch(`/api/playlists?id=${id}`)
      .then((res) => res.json())
      .then((data) => setPlaylist(data));
  }, [id]);

  const items = useMemo(() => playlist?.items ?? [], [playlist?.items]);

  // Extract scene ID from current item stream URL
  const currentSceneId = useMemo(() => {
    const currentItemIndex = playOrder[currentIndex] ?? 0;
    const currentItem = items[currentItemIndex];
    if (!currentItem?.item?.stream) return null;
    
    // Extract scene ID from stream URL pattern: /scene/{id}/stream
    const match = currentItem.item.stream.match(/\/scene\/([^\/]+)\/stream/);
    return match ? match[1] : null;
  }, [playOrder, currentIndex, items]);

  // Query marker details when scene changes
  const { data: sceneData, loading: sceneLoading, refetch: refetchSceneData } = useQuery(GET_SCENE_MARKER_DETAILS, {
    variables: { id: currentSceneId },
    skip: !currentSceneId,
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: false, // Prevent re-renders during refetch
  });

  // Find current marker details
  useEffect(() => {
    if (!sceneData?.findScene?.scene_markers) {
      setCurrentMarkerDetails(null);
      return;
    }

    const currentItemIndex = playOrder[currentIndex] ?? 0;
    const currentItem = items[currentItemIndex];
    if (!currentItem) {
      setCurrentMarkerDetails(null);
      return;
    }

    // Find marker that matches the current item's ID
    const marker = sceneData.findScene.scene_markers.find((m: any) => m.id === currentItem.item.id);
    setCurrentMarkerDetails(marker || null);
  }, [sceneData, currentIndex, playOrder, items]);

  // Handle marker tag updates
  const handleTagSave = useCallback(async (markerId: string, primaryTagId: string | null, tagIds: string[]) => {
    try {
      const result = await updateSceneMarker({
        variables: {
          input: {
            id: markerId,
            primary_tag_id: primaryTagId,
            tag_ids: tagIds,
          },
        },
        // Update Apollo cache but prevent unnecessary re-renders
        update: (cache, { data }) => {
          if (data?.sceneMarkerUpdate && currentSceneId) {
            try {
              const existingData = cache.readQuery({
                query: GET_SCENE_MARKER_DETAILS,
                variables: { id: currentSceneId },
              });

              if (existingData?.findScene?.scene_markers) {
                const updatedMarkers = existingData.findScene.scene_markers.map((marker: any) =>
                  marker.id === markerId ? data.sceneMarkerUpdate : marker
                );

                cache.writeQuery({
                  query: GET_SCENE_MARKER_DETAILS,
                  variables: { id: currentSceneId },
                  data: {
                    findScene: {
                      ...existingData.findScene,
                      scene_markers: updatedMarkers,
                    },
                  },
                });
              }
            } catch (cacheError) {
              // Silently handle cache errors to prevent breaking the mutation
              console.warn('Cache update failed:', cacheError);
            }
          }
        },
        // Prevent network status notifications that could trigger re-renders
        notifyOnNetworkStatusChange: false,
      });

      // Also update local state to ensure immediate UI updates
      if (result.data?.sceneMarkerUpdate) {
        setCurrentMarkerDetails(prevDetails => {
          if (!prevDetails || prevDetails.id !== markerId) return prevDetails;
          return result.data.sceneMarkerUpdate;
        });
      }
      
    } catch (error) {
      console.error('Failed to update marker tags:', error);
      throw error; // Re-throw so the component can handle the error
    }
  }, [updateSceneMarker, currentSceneId]);

  // Helper function to shuffle an array
  const shuffleArray = useCallback(<T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, []);

  // Reset index/order when items change
  useEffect(() => {
    const shouldShuffle = searchParams.get('shuffle') === 'true';
    const initialOrder = items.map((_, i) => i);
    
    if (shouldShuffle && items.length > 0) {
      setPlayOrder(shuffleArray(initialOrder));
    } else {
      setPlayOrder(initialOrder);
    }
    
    setCurrentIndex(0);
    setHasStarted(false);
    setPlayedItemIndices(new Set()); // Reset played items when playlist changes
  }, [items.length, searchParams, shuffleArray]);

  // Current item derived from playOrder
  const currentItemIndex = playOrder[currentIndex] ?? 0;
  const currentItem = items[currentItemIndex];

  // Memoize video options to prevent re-renders when only scene data changes
  const videoJsOptions = useMemo(() => ({
    autoplay: true, // Auto-play when new items are selected
    controls: true,
    responsive: true,
    fluid: true,
    aspectRatio: '16:9',
    sources: currentItem
      ? [{ src: currentItem.item.stream, type: "video/mp4" }]
      : [],
  }), [currentItem?.item?.stream]); // Only re-render when the actual video source changes

  const handlePlayerReady = useCallback((player: any) => {
    playerRef.current = player;
    player.muted(true);
    player.on("waiting", () => console.log("waiting"));
    player.on("dispose", () => console.log("dispose"));
  }, []);

  const handleVideoEnded = useCallback(() => {
    setHasStarted(true);
    // Mark current item as played
    const currentItemIndex = playOrder[currentIndex] ?? 0;
    setPlayedItemIndices(prev => new Set(prev).add(currentItemIndex));
    // Move to next item
    if (currentIndex < playOrder.length - 1) setCurrentIndex(i => i + 1);
  }, [playOrder, currentIndex, setCurrentIndex]);

  // Memoize offset to prevent video restarts when only scene data changes
  const offset = useMemo(() => currentItem
    ? {
        start: currentItem.item.startTime,
        end: currentItem.item.endTime,
        restart_beginning: false,
      }
    : undefined, [currentItem?.item?.startTime, currentItem?.item?.endTime]);

  if (!playlist) return <div>Loading...</div>;

  return (
    <Container maxWidth={false} sx={{ py: 1, px: { xs: 1, sm: 1.5, lg: 2 }, height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Grid container spacing={2} sx={{ flexGrow: 1, height: '100%', overflow: 'hidden' }}>
        <Grid xs={12} md={8} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box
            sx={{
              width: '100%',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'auto',
              minHeight: 0,
            }}
          >
            <Box
              sx={{
                width: '100%',
                borderRadius: 'md',
                overflow: 'hidden',
                bgcolor: 'neutral.900',
                flexShrink: 0, // Prevent video from shrinking
                '& .video-js': { 
                  width: '100%', 
                  height: 'auto', 
                  borderRadius: 'md',
                  overflow: 'hidden',
                },
                '& .vjs-control-bar': { bottom: 0 },
              }}
            >
              <VideoJS
                options={videoJsOptions}
                offset={offset}
                onReady={handlePlayerReady}
                hasStarted={hasStarted}
                onEnded={handleVideoEnded}
              />
            </Box>

            {/* Current Item Info */}
            {currentItem && (
              <Box
                sx={{
                  mt: 1.5,
                  p: 1.5,
                  borderRadius: 'md',
                  bgcolor: 'background.level1',
                }}
              >
                {/* Title and Rating Row */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography level="title-lg" sx={{ fontWeight: 600, flex: 1 }}>
                    {currentItem.item.title}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                      Rate:
                    </Typography>
                    <StarRating
                      value={currentItem.item.rating}
                      onChange={(rating) => {
                        handleRatingChange(currentItem.item.id, rating);
                      }}
                      size="md"
                    />
                  </Box>
                </Box>

                {/* Marker Tag Editor */}
                {currentMarkerDetails ? (
                  <MarkerTagEditor
                    markerId={currentItem.item.id}
                    currentPrimaryTag={currentMarkerDetails.primary_tag}
                    currentTags={currentMarkerDetails.tags || []}
                    onSave={handleTagSave}
                    loading={sceneLoading}
                    compact={true}
                  />
                ) : sceneLoading ? (
                  <Typography level="body-sm" sx={{ opacity: 0.7 }}>
                    Loading marker details...
                  </Typography>
                ) : (
                  <Typography level="body-sm" sx={{ opacity: 0.7 }}>
                    No marker details available
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </Grid>

        <Grid xs={12} md={4} sx={{ minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <PlaylistDetail
            title={playlist?.name}
            showCounts
            items={items}
            // 👇 pass/consume play order so shuffle affects playback
            playOrder={playOrder}
            onOrderChange={(order) => {
              setPlayOrder(order);
              setCurrentIndex(0); // start from first in the new order
            }}
            currentIndex={currentIndex}
            setCurrentIndex={setCurrentIndex} // interpreted as index within playOrder
            onDoubleClickPlay={(i) => setCurrentIndex(i)}
            playedItemIndices={playedItemIndices}
            // onRemoveItem={(id) => {/* DELETE /api/playlists/:id/items with { itemId: id } */}}
          />
        </Grid>
      </Grid>
    </Container>
  );
}
