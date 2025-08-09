'use client'
import * as React from 'react';
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Grid, Container, Sheet, Box } from '@mui/joy';
import VideoJS from "@/components/videojs/VideoJS";
import { PlaylistDetail } from '@/components/PlaylistDetail';

type PlaylistItem = {
  id: string;
  item: {
    stream: string;
    title: string;
    startTime: number;
    endTime: number;
    screenshot?: string;
  };
};

type Playlist = {
  name: string;
  items: PlaylistItem[];
};

export default function PlaylistPlayer() {
  const { id } = useParams();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0); // index within playOrder
  const [isMuted, setIsMuted] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);

  // NEW: order of indices into `items` used for playback (so shuffle affects play)
  const [playOrder, setPlayOrder] = useState<number[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);

  // Fetch playlist
  useEffect(() => {
    fetch(`/api/playlists?id=${id}`)
      .then((res) => res.json())
      .then((data) => setPlaylist(data));
  }, [id]);

  const items = playlist?.items ?? [];

  // Reset index/order when items change
  useEffect(() => {
    setPlayOrder(items.map((_, i) => i));
    setCurrentIndex(0);
    setHasStarted(false);
  }, [items.length]);

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

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.muted(isMuted);
    }
  }, [isMuted]);

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
      <Grid container spacing={2} sx={{ flexGrow: 1 }}>
        <Grid xs={9} sx={{ display: 'flex' }}>
          <Sheet
            variant="plain"
            sx={{
              p: 0,
              borderRadius: 0,
              bgcolor: 'transparent',
              width: '100%',
              maxWidth: 1920,
              mx: 'auto',
            }}
          >
            <Box
              sx={{
                width: '100%',
                '& .video-js': { width: '100%', height: 'auto', borderRadius: 0, overflow: 'visible' },
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
                  if (currentIndex < playOrder.length - 1) setCurrentIndex(i => i + 1);
                }}
              />
            </Box>
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
            // onRemoveItem={(id) => {/* DELETE /api/playlists/:id/items with { itemId: id } */}}
          />
        </Grid>
      </Grid>
    </Container>
  );
}
