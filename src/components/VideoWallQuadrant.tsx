// src/components/VideoWallQuadrant.tsx
"use client";

import React, { useRef, useEffect, useCallback, memo, useState } from "react";
import { Box, Chip, Sheet } from "@mui/joy";
import { VolumeX, Volume2, SkipForward } from "lucide-react";
import VideoJS from "@/components/videojs/VideoJS";
import { makeStashUrl } from "@/lib/urlUtils";

interface PlaylistItem {
  id: string;
  item: {
    id: string;
    stream: string;
    title: string;
    startTime: number;
    endTime: number;
    screenshot?: string;
    rating?: number | null;
    markerId?: string;
  };
}

interface VideoWallQuadrantProps {
  item: PlaylistItem | null;
  quadrantIndex: number;
  isMuted: boolean;
  onMuteToggle: () => void;
  onSkip: () => void;
  onEnded: () => void;
  isPaused: boolean;
  stashServer: string;
  stashApiKey: string;
}

function EmptyQuadrant({ quadrantIndex }: { quadrantIndex: number }) {
  return (
    <Sheet
      variant="soft"
      sx={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "md",
        bgcolor: "neutral.800",
        position: "relative",
      }}
    >
      <Chip
        size="sm"
        variant="soft"
        color="neutral"
        sx={{ position: "absolute", top: 8, left: 8 }}
      >
        {quadrantIndex + 1}
      </Chip>
    </Sheet>
  );
}

function VideoWallQuadrant({
  item,
  quadrantIndex,
  isMuted,
  onMuteToggle,
  onSkip,
  onEnded,
  isPaused,
  stashServer,
  stashApiKey,
}: VideoWallQuadrantProps) {
  const playerRef = useRef<any>(null);
  const [showControls, setShowControls] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Show controls on mouse move, hide after 2 seconds of inactivity
  const handleMouseMove = useCallback(() => {
    setShowControls(true);

    // Clear existing timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }

    // Set new timeout to hide controls
    hideTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 2000);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Sync pause state with player - only act if player state differs from desired state
  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed()) return;

    if (isPaused && !player.paused()) {
      player.pause();
    } else if (!isPaused && player.paused()) {
      // Only play if actually paused - avoids conflict with autoplay
      player.play()?.catch(() => {});
    }
  }, [isPaused]);

  // Sync mute state with player
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.muted(isMuted);
    }
  }, [isMuted]);

  const handleReady = useCallback((player: any) => {
    playerRef.current = player;
    // Ensure muted state is set on ready
    player.muted(isMuted);
    // Autoplay is handled by the VideoJS options (autoplay: true)
    // No need for manual play() call which causes "interrupted by new load" warnings
  }, [isMuted]);

  if (!item) {
    return <EmptyQuadrant quadrantIndex={quadrantIndex} />;
  }

  const videoSrc = makeStashUrl(item.item.stream, stashServer, stashApiKey);

  return (
    <Box
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(false)}
      sx={{
        position: "relative",
        height: "100%",
        border: isMuted ? "2px solid transparent" : "3px solid",
        borderColor: isMuted ? "transparent" : "primary.500",
        borderRadius: "md",
        overflow: "hidden",
        bgcolor: "neutral.900",
        transition: "border-color 0.2s ease",
        "&:hover": {
          borderColor: isMuted ? "neutral.600" : "primary.400",
        },
      }}
    >
      {/* Quadrant number indicator - hidden until mouse activity */}
      <Chip
        size="sm"
        variant="soft"
        color={isMuted ? "neutral" : "primary"}
        sx={{
          position: "absolute",
          top: 8,
          left: 8,
          zIndex: 10,
          pointerEvents: "none",
          opacity: showControls ? 1 : 0,
          transition: "opacity 0.2s ease",
        }}
      >
        {quadrantIndex + 1}
      </Chip>

      {/* Control buttons - hidden until mouse activity */}
      <Box
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          opacity: showControls ? 1 : 0,
          transition: "opacity 0.2s ease",
        }}
      >
        {/* Skip button */}
        <Box
          onClick={(e) => {
            e.stopPropagation();
            onSkip();
          }}
          sx={{
            color: "neutral.300",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(0,0,0,0.5)",
            borderRadius: "sm",
            p: 0.5,
            cursor: "pointer",
            transition: "all 0.15s ease",
            "&:hover": {
              bgcolor: "rgba(0,0,0,0.7)",
              color: "primary.300",
            },
          }}
        >
          <SkipForward size={18} />
        </Box>
        {/* Mute button */}
        <Box
          onClick={(e) => {
            e.stopPropagation();
            onMuteToggle();
          }}
          sx={{
            color: isMuted ? "neutral.400" : "primary.300",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(0,0,0,0.5)",
            borderRadius: "sm",
            p: 0.5,
            cursor: "pointer",
            transition: "all 0.15s ease",
            "&:hover": {
              bgcolor: "rgba(0,0,0,0.7)",
              color: isMuted ? "neutral.200" : "primary.200",
            },
          }}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </Box>
      </Box>

      {/* Video Player - absolute positioned to fill container */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: "none", // Prevent clicks from reaching video player
          "& .video-player": { height: "100%", width: "100%" },
          "& .video-player > div": { height: "100%", width: "100%" },
          "& .video-js": { height: "100% !important", width: "100% !important" },
          "& video": { objectFit: "cover !important" },
        }}
      >
        <VideoJS
          options={{
            sources: [{ src: videoSrc, type: "video/mp4" }],
            controls: false,
            autoplay: true,
            muted: isMuted,
            fluid: false,
            fill: true,
          }}
          offset={{ start: item.item.startTime, end: item.item.endTime }}
          onReady={handleReady}
          onEnded={onEnded}
          wallMode={true}
          hasStarted={true}
        />
      </Box>
    </Box>
  );
}

// Custom comparison - only re-render if the video source or key props change
const arePropsEqual = (
  prevProps: VideoWallQuadrantProps,
  nextProps: VideoWallQuadrantProps
) => {
  // Re-render if item changes (different video)
  if (prevProps.item?.item?.id !== nextProps.item?.item?.id) return false;
  if (prevProps.item?.item?.stream !== nextProps.item?.item?.stream) return false;

  // Re-render if mute state changes
  if (prevProps.isMuted !== nextProps.isMuted) return false;

  // Re-render if pause state changes
  if (prevProps.isPaused !== nextProps.isPaused) return false;

  // Don't re-render for other prop changes (onEnded, onMuteToggle callbacks)
  return true;
};

export default memo(VideoWallQuadrant, arePropsEqual);
