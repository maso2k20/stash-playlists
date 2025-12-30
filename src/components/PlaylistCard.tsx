// src/components/PlaylistCard.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Box,
  Card,
  CardContent,
  CardActions,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/joy";
import {
  Trash2,
  Pencil,
  Film,
  Clock,
  User,
  Tag as TagIcon,
  RefreshCcw,
  Star,
  Play,
  Shuffle,
  LayoutGrid,
} from "lucide-react";

export type PlaylistType = "MANUAL" | "SMART";

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  type: PlaylistType;
  image?: string;
}

export type PlaylistStats = {
  itemCount: number;
  durationMs?: number;
};

export type ParsedConds = {
  actors: string[]; // names
  tags: string[];   // names
  minRating: number | null;
};

interface PlaylistCardProps {
  playlist: Playlist;
  stats?: PlaylistStats;
  conditions?: ParsedConds;
  isRefreshing?: boolean;
  onRefresh?: (playlistId: string) => void;
  onDelete?: (playlistId: string) => void;
  hideActorFilter?: boolean; // Hide the actor filter row (useful when viewing from actor page)
  returnTo?: string; // URL to return to after editing
  // Selection mode props
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (playlistId: string) => void;
}

const typeColor: Record<PlaylistType, "neutral" | "success"> = {
  MANUAL: "neutral",
  SMART: "success",
};

const formatDuration = (ms?: number) => {
  if (!ms || ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
};

const maxShow = 3;

export default function PlaylistCard({
  playlist,
  stats,
  conditions,
  isRefreshing = false,
  onRefresh,
  onDelete,
  hideActorFilter = false,
  returnTo,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}: PlaylistCardProps) {
  const router = useRouter();
  const s = stats;
  const durationLabel = formatDuration(s?.durationMs);

  const c = conditions;
  const actorNames = c?.actors ?? [];
  const tagNames = c?.tags ?? [];
  const moreActors = Math.max(0, actorNames.length - maxShow);
  const moreTags = Math.max(0, tagNames.length - maxShow);

  const isSmart = playlist.type === "SMART";
  const isBusy = isRefreshing;

  const handleCardClick = () => {
    if (selectionMode && onToggleSelect) {
      onToggleSelect(playlist.id);
    }
  };

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        cursor: selectionMode ? "pointer" : "default",
        borderColor: isSelected ? "primary.500" : undefined,
        bgcolor: isSelected ? "primary.softBg" : undefined,
        transition: "border-color 0.15s, background-color 0.15s",
        "&:hover": selectionMode ? {
          borderColor: isSelected ? "primary.500" : "primary.300",
        } : undefined,
      }}
      onClick={selectionMode ? handleCardClick : undefined}
    >
      <CardContent sx={{ gap: 1, display: "flex", flexDirection: "row", alignItems: "stretch" }}>
        {/* Selection checkbox */}
        {selectionMode && (
          <Box sx={{ display: "flex", alignItems: "flex-start", pr: 1 }}>
            <Checkbox
              checked={isSelected}
              onChange={() => onToggleSelect?.(playlist.id)}
              onClick={(e) => e.stopPropagation()}
              sx={{ mt: 0.5 }}
            />
          </Box>
        )}
        {/* Left side content */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Header with title/description */}
          <Box sx={{ mb: 1 }}>
            <Link href={`/playlists/${playlist.id}`} style={{ textDecoration: "none" }}>
              <Typography
                level="title-lg"
                sx={{
                  "&:hover": { textDecoration: "underline" },
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={playlist.name}
              >
                {playlist.name}
              </Typography>
            </Link>
            {playlist.description?.trim() && (
              <Typography
                level="body-sm"
                color="neutral"
                sx={{
                  mt: 0.5,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {playlist.description.trim()}
              </Typography>
            )}
          </Box>

          {/* Stats row with type chip first */}
          <Stack direction="row" spacing={1} sx={{ mb: isSmart ? 1 : 0, flexWrap: "wrap" }}>
            <Chip size="sm" variant="soft" color={typeColor[playlist.type]} sx={{ textTransform: "capitalize" }}>
              {playlist.type.toLowerCase()}
            </Chip>
            <Chip size="sm" variant="outlined" startDecorator={<Film size={14} />}>
              {s ? `${s.itemCount} item${s.itemCount === 1 ? "" : "s"}` : "..."}
            </Chip>
            {durationLabel && (
              <Chip size="sm" variant="outlined" startDecorator={<Clock size={14} />}>
                {durationLabel}
              </Chip>
            )}
            {isBusy && (
              <Chip
                size="sm"
                variant="soft"
                color="warning"
                startDecorator={<RefreshCcw className="animate-spin" size={14} />}
              >
                Refreshing...
              </Chip>
            )}
          </Stack>

          {/* SMART conditions row */}
          {isSmart && (
            <Stack spacing={0.75}>
              {/* Actors - only show if not hidden */}
              {!hideActorFilter && (
                <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                  <User size={14} />
                  {actorNames.slice(0, maxShow).map((name) => (
                    <Chip key={name} size="sm" variant="soft" title={name}>
                      {name}
                    </Chip>
                  ))}
                  {moreActors > 0 && (
                    <Chip size="sm" variant="plain">{`+${moreActors} more`}</Chip>
                  )}
                  {actorNames.length === 0 && <Typography level="body-xs" color="neutral">No actors filter</Typography>}
                </Stack>
              )}

              {/* Tags */}
              <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                <TagIcon size={14} />
                {tagNames.slice(0, maxShow).map((name) => (
                  <Chip key={name} size="sm" variant="soft" title={name}>
                    {name}
                  </Chip>
                ))}
                {moreTags > 0 && (
                  <Chip size="sm" variant="plain">{`+${moreTags} more`}</Chip>
                )}
                {tagNames.length === 0 && <Typography level="body-xs" color="neutral">No tags filter</Typography>}
              </Stack>

              {/* Rating */}
              <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                <Star size={14} />
                {c?.minRating ? (
                  <Chip size="sm" variant="soft" title={`Minimum rating: ${c.minRating} stars`}>
                    {c.minRating}+ stars
                  </Chip>
                ) : (
                  <Typography level="body-xs" color="neutral">No rating filter</Typography>
                )}
              </Stack>
            </Stack>
          )}
        </Box>

        {/* Right side image */}
        {playlist.image && (
          <Box
            sx={{
              position: 'relative',
              width: 96,
              height: 170, // 9:16 aspect ratio (96*16/9 ≈ 170)
              borderRadius: 'md',
              overflow: 'hidden',
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'neutral.softBg',
              flexShrink: 0,
              boxShadow: 'sm',
              ml: 2,
            }}
          >
            <Image
              src={`/api/playlist-images/${playlist.image}`}
              alt={`${playlist.name} cover`}
              fill
              style={{ objectFit: 'cover' }}
            />
          </Box>
        )}
      </CardContent>

      {!selectionMode && <Divider />}

      {!selectionMode && (
          <CardActions sx={{ mt: "auto", justifyContent: "space-between" }}>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Play playlist">
            <IconButton
              size="sm"
              variant="plain"
              onClick={() => router.push(`/playlists/${playlist.id}`)}
              aria-label="Play playlist"
            >
              <Play size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Shuffle and play">
            <IconButton
              size="sm"
              variant="plain"
              onClick={() => router.push(`/playlists/${playlist.id}?shuffle=true`)}
              aria-label="Shuffle and play playlist"
            >
              <Shuffle size={16} />
            </IconButton>
          </Tooltip>
          {(s?.itemCount ?? 0) >= 4 && (
            <Tooltip title="Play as Wall (4 videos)">
              <IconButton
                size="sm"
                variant="plain"
                onClick={() => router.push(`/playlists/${playlist.id}/wall`)}
                aria-label="Play as video wall"
              >
                <LayoutGrid size={16} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>

        <Stack direction="row" spacing={0.5}>
          {/* Refresh (SMART only) */}
          {isSmart && onRefresh && (
            <Tooltip title="Refresh items (rebuild from rules)">
              <span>
                <IconButton
                  size="sm"
                  variant="soft"
                  onClick={() => onRefresh(playlist.id)}
                  disabled={isBusy}
                  aria-label="Refresh playlist"
                >
                  <RefreshCcw className={isBusy ? "animate-spin" : ""} size={16} />
                </IconButton>
              </span>
            </Tooltip>
          )}

          <Tooltip title="Edit playlist">
            <IconButton
              size="sm"
              variant="soft"
              onClick={() => {
                const editType = playlist.type.toLowerCase();
                const returnParam = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
                router.push(`/playlists/edit/${editType}/${playlist.id}${returnParam}`);
              }}
              aria-label="Edit Playlist"
            >
              <Pencil size={16} />
            </IconButton>
          </Tooltip>

          {onDelete && (
            <Tooltip title="Delete playlist">
              <IconButton
                size="sm"
                variant="soft"
                color="danger"
                onClick={() => onDelete(playlist.id)}
                aria-label="Delete Playlist"
              >
                <Trash2 size={16} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </CardActions>
      )}
    </Card>
  );
}
