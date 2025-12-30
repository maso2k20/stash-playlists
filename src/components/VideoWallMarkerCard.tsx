// src/components/VideoWallMarkerCard.tsx
"use client";

import React from "react";
import { Box, Card, Chip, Stack, Typography, Sheet } from "@mui/joy";
import StarRating from "@/components/StarRating";
import MarkerTagEditor from "@/components/MarkerTagEditor";

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

interface MarkerDetails {
  id: string;
  title: string;
  seconds: number;
  end_seconds: number | null;
  primary_tag: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string }>;
}

interface VideoWallMarkerCardProps {
  item: PlaylistItem | null;
  quadrantIndex: number;
  markerDetails: MarkerDetails | null;
  markerLoading?: boolean;
  onRatingChange: (itemId: string, rating: number | null) => void;
  onTagSave: (markerId: string, primaryTagId: string | null, tagIds: string[]) => Promise<void>;
}

function EmptyMarkerCard({ quadrantIndex }: { quadrantIndex: number }) {
  return (
    <Sheet
      variant="soft"
      sx={{
        p: 1.5,
        borderRadius: "md",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 100,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1}>
        <Chip size="sm" variant="soft" color="neutral">
          {quadrantIndex + 1}
        </Chip>
        <Typography level="body-sm" color="neutral">
          No video
        </Typography>
      </Stack>
    </Sheet>
  );
}

export default function VideoWallMarkerCard({
  item,
  quadrantIndex,
  markerDetails,
  markerLoading = false,
  onRatingChange,
  onTagSave,
}: VideoWallMarkerCardProps) {
  if (!item) {
    return <EmptyMarkerCard quadrantIndex={quadrantIndex} />;
  }

  return (
    <Card
      variant="outlined"
      sx={{
        p: 1.5,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Stack spacing={1.5} sx={{ flex: 1 }}>
        {/* Header with quadrant number and title */}
        <Stack direction="row" alignItems="center" spacing={1}>
          <Chip size="sm" variant="soft" color="primary">
            {quadrantIndex + 1}
          </Chip>
          <Typography
            level="title-sm"
            noWrap
            sx={{ flex: 1 }}
            title={item.item.title}
          >
            {item.item.title}
          </Typography>
        </Stack>

        {/* Rating */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography level="body-xs" color="neutral">
            Rating:
          </Typography>
          <StarRating
            value={item.item.rating}
            onChange={(rating) => onRatingChange(item.item.id, rating)}
            size="sm"
          />
        </Box>

        {/* Tag Editor */}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {markerDetails ? (
            <MarkerTagEditor
              markerId={item.item.id}
              currentPrimaryTag={markerDetails.primary_tag}
              currentTags={markerDetails.tags || []}
              onSave={onTagSave}
              loading={markerLoading}
              compact={true}
            />
          ) : markerLoading ? (
            <Typography level="body-xs" sx={{ opacity: 0.7 }}>
              Loading...
            </Typography>
          ) : (
            <Typography level="body-xs" sx={{ opacity: 0.7 }}>
              No marker details
            </Typography>
          )}
        </Box>
      </Stack>
    </Card>
  );
}
