// src/components/PlaylistCard.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Pencil,
  RefreshCcw,
  Play,
  Shuffle,
  LayoutGrid,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  tags: string[]; // names
  minRating: number | null;
  exactRating: number | null;
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

const RATING_EMOJI: Record<number, string> = { 1: "👎", 2: "👍", 3: "👍👍" };

export default function PlaylistCard({
  playlist,
  stats,
  conditions,
  isRefreshing = false,
  onRefresh,
  onDelete,
  returnTo,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}: PlaylistCardProps) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const s = stats;
  const durationLabel = formatDuration(s?.durationMs);

  const c = conditions;
  const tagNames = c?.tags ?? [];
  const ratingLevel = c?.exactRating ?? c?.minRating ?? null;

  const isSmart = playlist.type === "SMART";
  const itemCount = s?.itemCount ?? 0;

  const editPath = () => {
    const editType = playlist.type.toLowerCase();
    const returnParam = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
    return `/playlists/edit/${editType}/${playlist.id}${returnParam}`;
  };

  return (
    <div
      onClick={selectionMode ? () => onToggleSelect?.(playlist.id) : undefined}
      className="con-card flex items-center gap-[13px] p-3"
      style={{
        cursor: selectionMode ? "pointer" : "default",
        borderColor: isSelected ? "var(--accent-cyan)" : undefined,
        background: isSelected ? "var(--accent-tint-bg)" : undefined,
      }}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect?.(playlist.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 shrink-0 accent-[var(--accent-cyan)]"
          aria-label={`Select ${playlist.name}`}
        />
      )}

      {/* Cover thumb */}
      <div className="relative h-20 w-[62px] shrink-0 overflow-hidden rounded-[5px]">
        {playlist.image && !imgError ? (
          <Image
            src={`/api/playlist-images/${playlist.image}`}
            alt=""
            fill
            sizes="62px"
            style={{ objectFit: "cover" }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-mono text-[18px]"
            style={{
              background: "linear-gradient(150deg,#1e2226,#15181b)",
              color: "var(--accent-cyan)",
            }}
          >
            {playlist.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Middle content */}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/playlists/${playlist.id}`}
            onClick={(e) => e.stopPropagation()}
            className="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-semibold no-underline hover:underline"
            style={{ color: "var(--con-text)" }}
            title={playlist.name}
          >
            {playlist.name}
          </Link>
          <span
            className="shrink-0 rounded-[4px] px-[5px] py-[2px] font-mono text-[8px] uppercase tracking-[0.1em]"
            style={{ color: "var(--con-muted)", border: "1px solid var(--con-border-strong)" }}
          >
            {playlist.type.toLowerCase()}
          </span>
        </div>

        <div className="mt-1.5 font-mono text-[11px]" style={{ color: "var(--con-muted)" }}>
          {s ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "…"}
          {durationLabel ? ` · ${durationLabel}` : ""}
          {isRefreshing && (
            <span style={{ color: "var(--rating)" }}> · refreshing…</span>
          )}
        </div>

        {isSmart && (tagNames.length > 0 || ratingLevel) && (
          <div className="mt-2 flex min-h-[18px] flex-wrap items-center gap-1.5">
            {tagNames.slice(0, 2).map((name) => (
              <span
                key={name}
                className="rounded-[4px] px-2 py-[2px] text-[10px]"
                style={{
                  color: "var(--con-text-3)",
                  background: "#202428",
                  border: "1px solid var(--con-border-strong)",
                }}
                title={name}
              >
                {name}
              </span>
            ))}
            {ratingLevel && (
              <span className="text-[11px]" style={{ color: "var(--rating)" }}>
                {RATING_EMOJI[ratingLevel] ?? `L${ratingLevel}`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right actions */}
      {!selectionMode && (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => router.push(`/playlists/${playlist.id}`)}
            aria-label="Play playlist"
            title="Play playlist"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[6px]"
            style={{ background: "var(--accent-cyan)", color: "var(--accent-ink)" }}
          >
            <Play size={12} fill="currentColor" stroke="none" />
          </button>
          <button
            type="button"
            onClick={() => router.push(`/playlists/${playlist.id}?shuffle=true`)}
            aria-label="Shuffle and play playlist"
            title="Shuffle and play"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[6px]"
            style={{ border: "1px solid var(--con-border-strong)", color: "var(--con-muted)" }}
          >
            <Shuffle size={13} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                title="More actions"
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[6px]"
                style={{ border: "1px solid var(--con-border-strong)", color: "var(--con-muted)" }}
              >
                <MoreHorizontal size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(editPath())}>
                <Pencil size={14} /> Edit
              </DropdownMenuItem>
              {itemCount >= 4 && (
                <DropdownMenuItem onClick={() => router.push(`/playlists/${playlist.id}/wall`)}>
                  <LayoutGrid size={14} /> Play as Wall
                </DropdownMenuItem>
              )}
              {isSmart && onRefresh && (
                <DropdownMenuItem
                  onClick={() => onRefresh(playlist.id)}
                  disabled={isRefreshing}
                >
                  <RefreshCcw size={14} className={isRefreshing ? "animate-spin" : ""} /> Refresh
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(playlist.id)}
                  variant="destructive"
                >
                  <Trash2 size={14} /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
