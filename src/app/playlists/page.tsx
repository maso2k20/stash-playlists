// file: src/app/playlists/page.tsx
"use client";

import { useState, ChangeEvent, useMemo } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { PLAYLISTS_LIST_KEY, playlistsFetcher, invalidatePlaylists } from "@/lib/playlistsCache";
import {
  Plus,
  RefreshCcw,
  Search,
  CheckSquare,
  X,
  Trash2,
  Check,
} from "lucide-react";
import { useStashTags } from "@/context/StashTagsContext";
import PlaylistCard, {
  Playlist,
  PlaylistStats,
  ParsedConds,
  PlaylistType,
} from "@/components/PlaylistCard";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Shape returned by the consolidated GET /api/playlists endpoint.
type ConsolidatedPlaylist = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  image?: string | null;
  itemCount: number;
  durationMs: number;
  conditionsResolved?: {
    actors: Array<{ id: string; name: string }>;
    tagIds: string[];
    requiredTagIds: string[];
    optionalTagIds: string[];
    minRating: number | null;
    exactRating: number | null;
  };
};

type SortOption =
  | "name-asc"
  | "name-desc"
  | "items-desc"
  | "items-asc"
  | "duration-desc"
  | "duration-asc";

const SORT_LABELS: Record<SortOption, string> = {
  "name-asc": "Name (A–Z)",
  "name-desc": "Name (Z–A)",
  "items-desc": "Most Items",
  "items-asc": "Fewest Items",
  "duration-desc": "Longest Duration",
  "duration-asc": "Shortest Duration",
};

/** Token-styled toggle pill with a checkbox square (matches the Console controls row). */
function TogglePill({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-[7px] rounded-[6px] px-[11px] py-[7px] text-[12px]"
      style={{
        background: "var(--well)",
        border: "1px solid var(--con-border)",
        color: checked ? "var(--con-text-2)" : "var(--con-muted)",
      }}
    >
      <span
        className="flex h-[14px] w-[14px] items-center justify-center rounded-[4px]"
        style={
          checked
            ? { background: "var(--accent-cyan)", color: "var(--accent-ink)" }
            : { border: "1px solid var(--con-border-faint)" }
        }
      >
        {checked && <Check size={9} strokeWidth={4} />}
      </span>
      {label}
    </button>
  );
}

export default function PlaylistsPage() {
  const router = useRouter();
  const { stashTags } = useStashTags();

  const { data: rawPlaylists, error: swrError, isLoading } = useSWR<ConsolidatedPlaylist[]>(
    PLAYLISTS_LIST_KEY,
    playlistsFetcher,
  );

  const loading = isLoading;
  const error = swrError ? (swrError.message ?? "Failed to load playlists") : null;

  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [bulkRefreshing, setBulkRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("name-asc");
  const [hideEmpty, setHideEmpty] = useState(true);
  const [hidePerformerPlaylists, setHidePerformerPlaylists] = useState(true);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<PlaylistType>("SMART");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<string | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const playlists: Playlist[] = useMemo(
    () => (rawPlaylists ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? undefined,
      type: p.type as PlaylistType,
      image: p.image ?? undefined,
    })),
    [rawPlaylists],
  );

  const stats: Record<string, PlaylistStats> = useMemo(() => {
    const out: Record<string, PlaylistStats> = {};
    for (const p of rawPlaylists ?? []) {
      out[p.id] = { itemCount: p.itemCount ?? 0, durationMs: p.durationMs ?? 0 };
    }
    return out;
  }, [rawPlaylists]);

  const conds: Record<string, ParsedConds> = useMemo(() => {
    const tagNameById = (id: string) =>
      stashTags?.find((t: any) => String(t.id) === String(id))?.name ?? id;

    const out: Record<string, ParsedConds> = {};
    for (const p of rawPlaylists ?? []) {
      if (p.type !== "SMART" || !p.conditionsResolved) continue;
      const r = p.conditionsResolved;
      out[p.id] = {
        actors: (r.actors ?? []).map((a) => a?.name ?? a?.id).filter(Boolean),
        tags: (r.tagIds ?? []).map((id: string) => tagNameById(id)).filter(Boolean),
        minRating: r.minRating ?? null,
        exactRating: r.exactRating ?? null,
      };
    }
    return out;
  }, [rawPlaylists, stashTags]);

  const resetCreateForm = () => {
    setNewName("");
    setNewDesc("");
    setNewType("SMART");
  };

  const createPlaylist = async () => {
    if (!newName.trim()) return;
    const response = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim(), type: newType }),
    });
    if (response.ok) {
      const created = await response.json();
      resetCreateForm();
      setIsCreateOpen(false);
      await invalidatePlaylists();
      const returnTo = encodeURIComponent("/playlists");
      router.push(`/playlists/edit/${newType.toLowerCase()}/${created.id}?returnTo=${returnTo}`);
    }
  };

  const deletePlaylist = async () => {
    if (!toDeleteId) return;
    const response = await fetch(`/api/playlists?id=${toDeleteId}`, { method: "DELETE" });
    if (response.ok) {
      setToDeleteId(null);
      setIsDeleteOpen(false);
      await invalidatePlaylists();
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filteredAndSortedPlaylists.map((p) => p.id)));
  const deselectAll = () => setSelectedIds(new Set());
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    await Promise.allSettled(
      Array.from(selectedIds).map(async (id) => {
        const response = await fetch(`/api/playlists?id=${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error(`Failed to delete ${id}`);
        return id;
      })
    );
    await invalidatePlaylists();
    setBulkDeleting(false);
    setIsBulkDeleteOpen(false);
    exitSelectionMode();
  };

  const selectedPlaylistNames = useMemo(
    () => playlists.filter((p) => selectedIds.has(p.id)).map((p) => p.name),
    [playlists, selectedIds]
  );

  const refreshSmart = async (playlistId: string) => {
    setRefreshing((r) => ({ ...r, [playlistId]: true }));
    try {
      const res = await fetch(`/api/playlists/${playlistId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await invalidatePlaylists();
    } catch (e) {
      console.error("Refresh failed", e);
    } finally {
      setRefreshing((r) => ({ ...r, [playlistId]: false }));
    }
  };

  const refreshAllSmart = async () => {
    setBulkRefreshing(true);
    try {
      const res = await fetch("/api/smart-playlists/refresh-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        await res.json();
        await invalidatePlaylists();
      } else {
        console.error("Bulk refresh failed");
      }
    } catch (e) {
      console.error("Bulk refresh error:", e);
    } finally {
      setBulkRefreshing(false);
    }
  };

  const filteredAndSortedPlaylists = useMemo(() => {
    let filtered = playlists;

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (playlist) =>
          playlist.name.toLowerCase().includes(query) ||
          (playlist.description && playlist.description.toLowerCase().includes(query))
      );
    }
    if (hideEmpty) {
      filtered = filtered.filter((playlist) => (stats[playlist.id]?.itemCount ?? 0) > 0);
    }
    if (hidePerformerPlaylists) {
      filtered = filtered.filter((playlist) => !conds[playlist.id]?.actors?.length);
    }

    return [...filtered].sort((a, b) => {
      const sa = stats[a.id] || { itemCount: 0, durationMs: 0 };
      const sb = stats[b.id] || { itemCount: 0, durationMs: 0 };
      switch (sortOption) {
        case "name-asc": return a.name.localeCompare(b.name);
        case "name-desc": return b.name.localeCompare(a.name);
        case "items-desc": return sb.itemCount - sa.itemCount;
        case "items-asc": return sa.itemCount - sb.itemCount;
        case "duration-desc": return (sb.durationMs || 0) - (sa.durationMs || 0);
        case "duration-asc": return (sa.durationMs || 0) - (sb.durationMs || 0);
        default: return 0;
      }
    });
  }, [playlists, stats, conds, searchQuery, sortOption, hideEmpty, hidePerformerPlaylists]);

  const totalClips = useMemo(
    () => Object.values(stats).reduce((acc, s) => acc + (s.itemCount ?? 0), 0),
    [stats]
  );
  const hasSmart = playlists.some((p) => p.type === "SMART");

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-[26px] pt-[22px]">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Playlists</h2>
            {selectionMode && selectedIds.size > 0 && (
              <span
                className="rounded-[5px] px-2 py-[3px] font-mono text-[10px]"
                style={{
                  color: "var(--accent-cyan)",
                  background: "var(--accent-tint-bg)",
                  border: "1px solid var(--accent-tint-bd)",
                }}
              >
                {selectedIds.size} SELECTED
              </span>
            )}
          </div>
          <div className="con-count mt-1">
            {playlists.length} PLAYLISTS · {totalClips.toLocaleString()} CLIPS
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectionMode ? (
            <>
              <button onClick={selectAll} className="con-btn-ghost">Select All</button>
              <button onClick={deselectAll} disabled={selectedIds.size === 0} className="con-btn-ghost disabled:opacity-50">
                Deselect All
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setIsBulkDeleteOpen(true)}
                  className="con-btn-ghost"
                  style={{ borderColor: "var(--danger-bd)", color: "var(--danger)" }}
                >
                  <Trash2 size={14} /> Delete ({selectedIds.size})
                </button>
              )}
              <button onClick={exitSelectionMode} className="con-btn-ghost">
                <X size={14} /> Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setSelectionMode(true)} className="con-btn-ghost">
                <CheckSquare size={14} /> Select
              </button>
              {hasSmart && (
                <button onClick={refreshAllSmart} disabled={bulkRefreshing} className="con-btn-ghost disabled:opacity-60">
                  <RefreshCcw size={14} className={bulkRefreshing ? "animate-spin" : ""} />
                  {bulkRefreshing ? "Refreshing…" : "Refresh smart"}
                </button>
              )}
              <button onClick={() => setIsCreateOpen(true)} className="con-btn-primary">
                <Plus size={13} strokeWidth={2.6} /> New
              </button>
            </>
          )}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-[10px] px-[26px] pb-4 pt-[18px]">
        <div className="relative max-w-[300px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2"
            style={{ color: "var(--con-faint)" }}
          />
          <input
            value={searchQuery}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            placeholder="search…"
            aria-label="Search playlists"
            className="con-input w-full pl-[33px]"
          />
        </div>
        <TogglePill label="Hide empty" checked={hideEmpty} onChange={setHideEmpty} />
        <TogglePill label="Hide performer" checked={hidePerformerPlaylists} onChange={setHidePerformerPlaylists} />
        <div className="flex-1" />
        <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
          <SelectTrigger
            className="h-auto gap-2 rounded-[6px] border-[var(--con-border)] bg-[var(--well)] px-3 py-2 font-mono text-[12px] text-[var(--con-text-2)]"
            style={{ minWidth: 170 }}
          >
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortOption[]).map((k) => (
              <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && (
        <div className="mx-[26px] mb-2 h-[2px] overflow-hidden rounded" style={{ background: "var(--well)" }}>
          <div className="h-full w-1/3 animate-pulse" style={{ background: "var(--accent-cyan)" }} />
        </div>
      )}

      {error && (
        <div className="mx-[26px] mb-2 rounded-[6px] p-3 text-[13px]"
          style={{ background: "var(--surface)", border: "1px solid var(--danger-bd)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {/* Empty states */}
      {!loading && playlists.length === 0 && (
        <EmptyState
          title="You haven't added any playlists yet."
          subtitle="Create your first manual or smart playlist to get started."
          onCreate={() => setIsCreateOpen(true)}
        />
      )}
      {!loading && playlists.length > 0 && filteredAndSortedPlaylists.length === 0 && (
        <EmptyState
          title="No playlists match your search."
          subtitle="Try adjusting your search terms or create a new playlist."
          onClear={searchQuery ? () => setSearchQuery("") : undefined}
          onCreate={() => setIsCreateOpen(true)}
        />
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 gap-[11px] px-[26px] pb-[26px] pt-0.5 lg:grid-cols-2">
        {filteredAndSortedPlaylists.map((playlist) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            stats={stats[playlist.id]}
            conditions={conds[playlist.id]}
            isRefreshing={refreshing[playlist.id]}
            onRefresh={refreshSmart}
            onDelete={(id) => {
              setToDeleteId(id);
              setIsDeleteOpen(true);
            }}
            selectionMode={selectionMode}
            isSelected={selectedIds.has(playlist.id)}
            onToggleSelect={toggleSelection}
          />
        ))}
      </div>

      {/* Create dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Create Playlist</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="con-micro">Name</span>
              <input
                autoFocus
                placeholder="My playlist"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="con-input"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="con-micro">Description</span>
              <input
                placeholder="Optional"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="con-input"
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="con-micro">Type</span>
              <div className="flex gap-2">
                {(["SMART", "MANUAL"] as PlaylistType[]).map((t) => {
                  const active = newType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewType(t)}
                      className="rounded-[6px] px-3 py-[7px] text-[12px] capitalize"
                      style={
                        active
                          ? { background: "var(--accent-cyan)", color: "var(--accent-ink)", fontWeight: 600 }
                          : { border: "1px solid var(--con-border-strong)", color: "var(--con-text-2)" }
                      }
                    >
                      {t.toLowerCase()}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="rounded-[6px] p-3 text-[12px]" style={{ background: "var(--well)", color: "var(--con-muted)" }}>
              💡 You can add a cover image after creating the playlist by using Edit.
            </p>
          </div>
          <DialogFooter>
            <button onClick={() => setIsCreateOpen(false)} className="con-btn-ghost">Cancel</button>
            <button onClick={createPlaylist} disabled={!newName.trim()} className="con-btn-primary disabled:opacity-50">
              Create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete playlist?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px]" style={{ color: "var(--con-text-2)" }}>This action cannot be undone.</p>
          <DialogFooter>
            <button onClick={() => setIsDeleteOpen(false)} className="con-btn-ghost">No</button>
            <button
              onClick={deletePlaylist}
              className="con-btn-ghost"
              style={{ borderColor: "var(--danger-bd)", color: "var(--danger)" }}
            >
              Yes, delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete dialog */}
      <Dialog open={isBulkDeleteOpen} onOpenChange={(o) => !bulkDeleting && setIsBulkDeleteOpen(o)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size} playlist{selectedIds.size === 1 ? "" : "s"}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px]" style={{ color: "var(--con-text-2)" }}>
            This action cannot be undone. All items in these playlists will be removed.
          </p>
          {selectedPlaylistNames.length > 0 && (
            <div className="max-h-[200px] overflow-y-auto rounded-[6px] p-3" style={{ background: "var(--well)" }}>
              <div className="mb-1 text-[11px] font-bold" style={{ color: "var(--con-text-2)" }}>Playlists to delete:</div>
              {selectedPlaylistNames.map((name, idx) => (
                <div key={idx} className="py-[2px] text-[13px]" style={{ color: "var(--con-text-2)" }}>• {name}</div>
              ))}
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setIsBulkDeleteOpen(false)} disabled={bulkDeleting} className="con-btn-ghost disabled:opacity-50">
              Cancel
            </button>
            <button
              onClick={bulkDelete}
              disabled={bulkDeleting}
              className="con-btn-ghost disabled:opacity-50"
              style={{ borderColor: "var(--danger-bd)", color: "var(--danger)" }}
            >
              {bulkDeleting ? "Deleting…" : "Delete All"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({
  title,
  subtitle,
  onCreate,
  onClear,
}: {
  title: string;
  subtitle: string;
  onCreate: () => void;
  onClear?: () => void;
}) {
  return (
    <div
      className="mx-[26px] mb-2 rounded-[7px] p-8 text-center"
      style={{ background: "var(--surface)", border: "1px dashed var(--con-border-strong)" }}
    >
      <div className="mb-1 text-[16px] font-semibold">{title}</div>
      <div className="mb-4 text-[13px]" style={{ color: "var(--con-muted)" }}>{subtitle}</div>
      <div className="flex items-center justify-center gap-2">
        {onClear && (
          <button onClick={onClear} className="con-btn-ghost">Clear Search</button>
        )}
        <button onClick={onCreate} className="con-btn-primary">
          <Plus size={13} strokeWidth={2.6} /> New
        </button>
      </div>
    </div>
  );
}
