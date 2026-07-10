// src/components/VideoWallSummaryTile.tsx
"use client";

import React from "react";
import { Box, Card, Chip, Stack, Typography, Sheet } from "@mui/joy";
import StarRating from "@/components/StarRating";

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

interface VideoWallSummaryTileProps {
  item: PlaylistItem | null;
  quadrantIndex: number;
  markerDetails: MarkerDetails | null;
  selected: boolean;
  onSelect: (quadrantIndex: number) => void;
  onRatingChange: (itemId: string, rating: number | null) => void;
}

const MAX_TAG_CHIPS = 4;

function EmptyTile({ quadrantIndex }: { quadrantIndex: number }) {
  return (
    <Sheet
      variant="soft"
      sx={{
        p: 1.25,
        borderRadius: "md",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: 88,
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

export default function VideoWallSummaryTile({
  item,
  quadrantIndex,
  markerDetails,
  selected,
  onSelect,
  onRatingChange,
}: VideoWallSummaryTileProps) {
  if (!item) {
    return <EmptyTile quadrantIndex={quadrantIndex} />;
  }

  const additionalTags = (markerDetails?.tags || []).filter(
    (t) => t.id !== markerDetails?.primary_tag?.id
  );
  const shownTags = additionalTags.slice(0, MAX_TAG_CHIPS);
  const overflow = additionalTags.length - shownTags.length;

  return (
    <Card
      variant="outlined"
      onClick={() => onSelect(quadrantIndex)}
      sx={{
        p: 1.25,
        height: "100%",
        gap: 1,
        cursor: "pointer",
        borderColor: selected ? "primary.500" : undefined,
        boxShadow: selected ? "sm" : "none",
        bgcolor: selected ? "primary.softBg" : undefined,
        transition: "border-color 0.15s, box-shadow 0.15s",
        "&:hover": { borderColor: selected ? "primary.500" : "neutral.400" },
      }}
    >
      {/* Header: quadrant number + title */}
      <Stack direction="row" alignItems="center" spacing={1}>
        <Chip
          size="sm"
          variant={selected ? "solid" : "soft"}
          color={selected ? "primary" : "neutral"}
        >
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

      {/* Rating — editable directly from the tile */}
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <Typography level="body-xs" color="neutral">
          Rating:
        </Typography>
        <StarRating
          value={item.item.rating}
          onChange={(rating) => onRatingChange(item.item.id, rating)}
          size="sm"
        />
      </Box>

      {/* Current tags — read-only summary */}
      {markerDetails ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {markerDetails.primary_tag && (
            <Chip size="sm" variant="solid" color="primary">
              {markerDetails.primary_tag.name}
            </Chip>
          )}
          {shownTags.map((tag) => (
            <Chip key={tag.id} size="sm" variant="soft" color="neutral">
              {tag.name}
            </Chip>
          ))}
          {overflow > 0 && (
            <Chip size="sm" variant="soft" color="neutral">
              +{overflow}
            </Chip>
          )}
          {!markerDetails.primary_tag && additionalTags.length === 0 && (
            <Typography level="body-xs" sx={{ opacity: 0.6 }}>
              No tags
            </Typography>
          )}
        </Box>
      ) : (
        <Typography level="body-xs" sx={{ opacity: 0.6 }}>
          Loading tags…
        </Typography>
      )}
    </Card>
  );
}
