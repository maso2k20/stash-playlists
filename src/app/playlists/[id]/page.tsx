'use client'
import * as React from 'react';
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Grid, Container, Sheet, Box, Typography } from '@mui/joy';
import VideoJS from "@/components/videojs/VideoJS";
import { PlaylistDetail } from '@/components/PlaylistDetail';
import StarRating from '@/components/StarRating';

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

  // Helper function to shuffle an array
  const shuffleArray = useCallback(<T>(array: T[]): T[] => {
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

  const videoJsOptions = {
    autoplay: false,
    controls: true,
    responsive: true,
    fluid: false,
    width: 1920,
    height: 1080,
    sources: currentItem
      ? [{ src: currentItem.item.stream, type: "video/mp4" }]
      : [],
  };

  const handlePlayerReady = (player: any) => {
    playerRef.current = player;
    player.muted(true);
    player.on("waiting", () => console.log("waiting"));
    player.on("dispose", () => console.log("dispose"));
  };


  if (!playlist) return <div>Loading...</div>;

  const offset = currentItem
    ? {
        start: currentItem.item.startTime,
        end: currentItem.item.endTime,
        restart_beginning: false,
      }
    : undefined;

  return (
    <Container maxWidth={false} sx={{ py: 2, px: { xs: 1.5, sm: 2, lg: 3 } }}>
      <Grid container spacing={3} sx={{ flexGrow: 1, height: '100%' }}>
        <Grid xs={9} sx={{ display: 'flex', flexDirection: 'column' }}>
          <Sheet
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 'lg',
              bgcolor: 'background.surface',
              width: '100%',
              maxWidth: 1920,
              mx: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box
              sx={{
                width: '100%',
                borderRadius: 'md',
                overflow: 'hidden',
                bgcolor: 'neutral.900',
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
                options={{ ...videoJsOptions, fluid: true, aspectRatio: '16:9' }}
                offset={offset}
                onReady={handlePlayerReady}
                hasStarted={hasStarted}
                onEnded={() => {
                  setHasStarted(true);
                  // Mark current item as played
                  const currentItemIndex = playOrder[currentIndex] ?? 0;
                  setPlayedItemIndices(prev => new Set(prev).add(currentItemIndex));
                  // Move to next item
                  if (currentIndex < playOrder.length - 1) setCurrentIndex(i => i + 1);
                }}
              />
            </Box>

            {/* Current Item Info */}
            {currentItem && (
              <Sheet
                variant="soft"
                sx={{
                  mt: 2,
                  p: 2,
                  borderRadius: 'md',
                  bgcolor: 'background.level1',
                }}
              >
                <Typography level="title-lg" sx={{ mb: 1.5, fontWeight: 600 }}>
                  {currentItem.item.title}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography level="body-md" sx={{ color: 'text.secondary' }}>
                    Rate this clip:
                  </Typography>
                  <StarRating
                    value={currentItem.item.rating}
                    onChange={(rating) => {
                      handleRatingChange(currentItem.item.id, rating);
                    }}
                    size="lg"
                  />
                </Box>
              </Sheet>
            )}
          </Sheet>
        </Grid>

        <Grid xs={3} sx={{ minHeight: 0, display: 'flex' }}>
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
