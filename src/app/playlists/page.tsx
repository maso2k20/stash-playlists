// file: src/app/playlists/page.tsx
"use client";

import { useState, useEffect, ChangeEvent, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardActions,
  Chip,
  Divider,
  FormControl,
  FormLabel,
  Grid,
  IconButton,
  Input,
  LinearProgress,
  Modal,
  ModalClose,
  ModalDialog,
  Radio,
  RadioGroup,
  Select,
  Option,
  Sheet,
  Stack,
  Tooltip,
  Typography,
} from "@mui/joy";
import {
  Trash2,
  Plus,
  Pencil,
  Film,
  Clock,
  User,
  Tag as TagIcon,
  RefreshCcw,
  Star,
  Search,
  ArrowUpDown,
  Play,
  Shuffle,
} from "lucide-react";
import { useStashTags } from "@/context/StashTagsContext"; // ensure this path matches your project

type PlaylistType = "MANUAL" | "SMART";

interface Playlist {
  id: string;
  name: string;
  description?: string;
  type: PlaylistType;
  image?: string;
}

type PlaylistStats = {
  itemCount: number;
  durationMs?: number;
};

type ParsedConds = {
  actors: string[]; // names
  tags: string[];   // names
  minRating: number | null;
};

type SortOption = 
  | "name-asc" 
  | "name-desc" 
  | "items-desc" 
  | "items-asc" 
  | "duration-desc" 
  | "duration-asc";

export default function PlaylistsPage() {
  const router = useRouter();
  const { stashTags } = useStashTags(); // [{id, name, ...}] from Stash GraphQL

  // Lists & UI state
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-playlist stats and conditions
  const [stats, setStats] = useState<Record<string, PlaylistStats>>({});
  const [conds, setConds] = useState<Record<string, ParsedConds>>({});

  // Per-playlist "refreshing" state
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  
  // Bulk refresh state
  const [bulkRefreshing, setBulkRefreshing] = useState(false);

  // Search and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("name-asc");

  // Create dialog
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<PlaylistType>("MANUAL");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Delete dialog
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/playlists");
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const data = await res.json();
        setPlaylists(data);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load playlists");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Stats via /api/playlists/[id]/stats
  useEffect(() => {
    if (!playlists.length) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.allSettled(
        playlists.map(async (p) => {
          const res = await fetch(`/api/playlists/${p.id}/stats`);
          if (!res.ok) throw new Error("stats fetch failed");
          const data = await res.json();
          return [p.id, { itemCount: data.itemCount ?? 0, durationMs: data.durationMs ?? 0 }] as const;
        })
      );
      if (cancelled) return;
      setStats((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.status === "fulfilled") {
            const [id, s] = r.value;
            next[id] = s;
          }
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [playlists]);

  // SMART playlist conditions via /api/playlists/[id]
  // Resolve actor names from API, tag names via StashTagsContext
  useEffect(() => {
    const smarts = playlists.filter((p) => p.type === "SMART");
    if (!smarts.length) return;
    let cancelled = false;

    const tagNameById = (id: string) =>
      stashTags?.find((t: any) => String(t.id) === String(id))?.name ?? id;

    (async () => {
      const results = await Promise.allSettled(
        smarts.map(async (p) => {
          const res = await fetch(`/api/playlists/${p.id}`);
          if (!res.ok) throw new Error("playlist fetch failed");
          const data = await res.json();
          // API returns: conditionsResolved.actors [{id,name}], and tagIds (string[])
          const actorNames = (data.conditionsResolved?.actors ?? [])
            .map((a: any) => a?.name ?? a?.id)
            .filter(Boolean);
          const tagNames = (data.conditionsResolved?.tagIds ?? [])
            .map((id: string) => tagNameById(id))
            .filter(Boolean);
          const minRating = data.conditionsResolved?.minRating ?? null;
          return [p.id, { actors: actorNames, tags: tagNames, minRating } as ParsedConds] as const;
        })
      );

      if (cancelled) return;

      setConds((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.status === "fulfilled") {
            const [id, parsed] = r.value;
            next[id] = parsed;
          }
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [playlists, stashTags]); // re-run if tags load later

  // Helpers
  const resetCreateForm = () => {
    setNewName("");
    setNewDesc("");
    setNewType("MANUAL");
  };

  const createPlaylist = async () => {
    if (!newName.trim()) return;
    const response = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        description: newDesc.trim(),
        type: newType,
      }),
    });
    if (response.ok) {
      const created = await response.json();
      setPlaylists((prev) => [created, ...prev]);
      // optimistic seeds
      setStats((prev) => ({ ...prev, [created.id]: { itemCount: 0, durationMs: 0 } }));
      if (created.type === "SMART") setConds((prev) => ({ ...prev, [created.id]: { actors: [], tags: [], minRating: null } }));
      resetCreateForm();
      setIsCreateOpen(false);
    }
  };


  const deletePlaylist = async () => {
    if (!toDeleteId) return;
    const response = await fetch(`/api/playlists?id=${toDeleteId}`, { method: "DELETE" });
    if (response.ok) {
      setPlaylists((prev) => prev.filter((p) => p.id !== toDeleteId));
      setToDeleteId(null);
      setIsDeleteOpen(false);
    }
  };

  // 🔁 Refresh a SMART playlist using your unified items route
  const refreshSmart = async (playlistId: string) => {
    setRefreshing((r) => ({ ...r, [playlistId]: true }));
    try {
      const res = await fetch(`/api/playlists/${playlistId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Re-fetch stats so counts/duration update immediately
      const sRes = await fetch(`/api/playlists/${playlistId}/stats`);
      if (sRes.ok) {
        const sData = await sRes.json();
        setStats((prev) => ({
          ...prev,
          [playlistId]: {
            itemCount: sData.itemCount ?? 0,
            durationMs: sData.durationMs ?? 0,
          },
        }));
      }
      // (no need to re-fetch conditions—they don't change on refresh)
    } catch (e) {
      console.error("Refresh failed", e);
    } finally {
      setRefreshing((r) => ({ ...r, [playlistId]: false }));
    }
  };

  // 🔁 Refresh all smart playlists at once
  const refreshAllSmart = async () => {
    setBulkRefreshing(true);
    try {
      const res = await fetch("/api/smart-playlists/refresh-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      if (res.ok) {
        const result = await res.json();
        
        // Re-fetch stats for all playlists to update counts
        const results = await Promise.allSettled(
          playlists.map(async (p) => {
            if (p.type === "SMART") {
              const sRes = await fetch(`/api/playlists/${p.id}/stats`);
              if (sRes.ok) {
                const sData = await sRes.json();
                return [p.id, { itemCount: sData.itemCount ?? 0, durationMs: sData.durationMs ?? 0 }] as const;
              }
            }
            return null;
          })
        );

        setStats((prev) => {
          const next = { ...prev };
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) {
              const [id, s] = r.value;
              next[id] = s;
            }
          }
          return next;
        });

        // Show success message
        console.log("Bulk refresh completed:", result.message);
      } else {
        console.error("Bulk refresh failed");
      }
    } catch (e) {
      console.error("Bulk refresh error:", e);
    } finally {
      setBulkRefreshing(false);
    }
  };

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

  // Filtered and sorted playlists
  const filteredAndSortedPlaylists = useMemo(() => {
    let filtered = playlists;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(playlist => 
        playlist.name.toLowerCase().includes(query) ||
        (playlist.description && playlist.description.toLowerCase().includes(query))
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      const statsA = stats[a.id] || { itemCount: 0, durationMs: 0 };
      const statsB = stats[b.id] || { itemCount: 0, durationMs: 0 };

      switch (sortOption) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "items-desc":
          return statsB.itemCount - statsA.itemCount;
        case "items-asc":
          return statsA.itemCount - statsB.itemCount;
        case "duration-desc":
          return (statsB.durationMs || 0) - (statsA.durationMs || 0);
        case "duration-asc":
          return (statsA.durationMs || 0) - (statsB.durationMs || 0);
        default:
          return 0;
      }
    });

    return sorted;
  }, [playlists, stats, searchQuery, sortOption]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: "auto" }}>
      {/* Header with title, search, sort, and add button */}
      <Stack spacing={2} sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography level="h3">Playlists</Typography>
          <Stack direction="row" spacing={1}>
            {/* Bulk refresh button - only show if there are smart playlists */}
            {playlists.some(p => p.type === "SMART") && (
              <Button 
                startDecorator={bulkRefreshing ? <RefreshCcw className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
                color="neutral" 
                variant="outlined" 
                onClick={refreshAllSmart}
                disabled={bulkRefreshing}
              >
                {bulkRefreshing ? "Refreshing..." : "Refresh Smart Playlists"}
              </Button>
            )}
            <Button startDecorator={<Plus size={16} />} color="primary" variant="solid" onClick={() => setIsCreateOpen(true)}>
              Add Playlist
            </Button>
          </Stack>
        </Stack>
        
        {/* Search and Sort Controls */}
        <Stack 
          direction={{ xs: "column", sm: "row" }} 
          spacing={2} 
          alignItems={{ xs: "stretch", sm: "center" }}
        >
          <FormControl sx={{ flexGrow: 1, maxWidth: { sm: 400 } }}>
            <Input
              placeholder="Search playlists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              startDecorator={<Search size={16} />}
              endDecorator={
                searchQuery && (
                  <IconButton
                    size="sm"
                    variant="plain"
                    onClick={() => setSearchQuery("")}
                    sx={{ minHeight: 0, minWidth: 0 }}
                  >
                    ×
                  </IconButton>
                )
              }
              size="lg"
            />
          </FormControl>
          
          <FormControl sx={{ minWidth: 200 }}>
            <Select
              value={sortOption}
              onChange={(_, value) => setSortOption(value as SortOption)}
              startDecorator={<ArrowUpDown size={16} />}
              size="lg"
            >
              <Option value="name-asc">Name (A-Z)</Option>
              <Option value="name-desc">Name (Z-A)</Option>
              <Option value="items-desc">Most Items</Option>
              <Option value="items-asc">Fewest Items</Option>
              <Option value="duration-desc">Longest Duration</Option>
              <Option value="duration-asc">Shortest Duration</Option>
            </Select>
          </FormControl>
        </Stack>
      </Stack>

      {loading && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress thickness={2} />
        </Box>
      )}

      {error && (
        <Sheet
          variant="soft"
          color="danger"
          sx={{ p: 2, borderRadius: "md", mb: 2, border: "1px solid", borderColor: "danger.outlinedBorder" }}
        >
          <Typography level="body-sm">{error}</Typography>
        </Sheet>
      )}

      {!loading && playlists.length === 0 && (
        <Sheet
          variant="outlined"
          sx={{
            borderRadius: "lg",
            p: 4,
            textAlign: "center",
            borderStyle: "dashed",
            color: "neutral.500",
            mb: 2,
          }}
        >
          <Typography level="title-lg" sx={{ mb: 1 }}>
            You haven&apos;t added any playlists yet.
          </Typography>
          <Typography level="body-sm" sx={{ mb: 2 }}>
            Create your first manual or smart playlist to get started.
          </Typography>
          <Button startDecorator={<Plus size={16} />} onClick={() => setIsCreateOpen(true)}>
            Add Playlist
          </Button>
        </Sheet>
      )}

      {!loading && playlists.length > 0 && filteredAndSortedPlaylists.length === 0 && (
        <Sheet
          variant="outlined"
          sx={{
            borderRadius: "lg",
            p: 4,
            textAlign: "center",
            borderStyle: "dashed",
            color: "neutral.500",
            mb: 2,
          }}
        >
          <Typography level="title-lg" sx={{ mb: 1 }}>
            No playlists match your search.
          </Typography>
          <Typography level="body-sm" sx={{ mb: 2 }}>
            Try adjusting your search terms or create a new playlist.
          </Typography>
          {searchQuery && (
            <Button 
              variant="plain" 
              onClick={() => setSearchQuery("")}
              sx={{ mr: 2 }}
            >
              Clear Search
            </Button>
          )}
          <Button startDecorator={<Plus size={16} />} onClick={() => setIsCreateOpen(true)}>
            Add Playlist
          </Button>
        </Sheet>
      )}

      <Grid container spacing={2}>
        {filteredAndSortedPlaylists.map((playlist) => {
          const s = stats[playlist.id];
          const durationLabel = formatDuration(s?.durationMs);

          const c = conds[playlist.id];
          const actorNames = c?.actors ?? [];
          const tagNames = c?.tags ?? [];
          const moreActors = Math.max(0, actorNames.length - maxShow);
          const moreTags = Math.max(0, tagNames.length - maxShow);

          const isSmart = playlist.type === "SMART";
          const isBusy = !!refreshing[playlist.id];

          return (
            <Grid xs={12} sm={6} lg={4} key={playlist.id}>
              <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <CardContent sx={{ gap: 1, display: "flex", flexDirection: "row", alignItems: "stretch" }}>
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
                        {s ? `${s.itemCount} item${s.itemCount === 1 ? "" : "s"}` : "…"}
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
                        {/* Actors */}
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

                <Divider />

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
                  </Stack>

                  <Stack direction="row" spacing={0.5}>
                    {/* 🔁 Refresh (SMART only) */}
                    {isSmart && (
                      <Tooltip title="Refresh items (rebuild from rules)">
                        <span>
                          <IconButton
                            size="sm"
                            variant="soft"
                            onClick={() => refreshSmart(playlist.id)}
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
                          router.push(`/playlists/edit/${editType}/${playlist.id}`);
                        }}
                        aria-label="Edit Playlist"
                      >
                        <Pencil size={16} />
                      </IconButton>
                    </Tooltip>

                    <Tooltip title="Delete playlist">
                      <IconButton
                        size="sm"
                        variant="soft"
                        color="danger"
                        onClick={() => {
                          setToDeleteId(playlist.id);
                          setIsDeleteOpen(true);
                        }}
                        aria-label="Delete Playlist"
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Create Playlist Modal */}
      <Modal open={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <ModalDialog aria-labelledby="create-playlist" sx={{ minWidth: 420 }}>
          <ModalClose />
          <Typography id="create-playlist" level="title-lg">
            Create Playlist
          </Typography>
          <Divider />
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl required>
              <FormLabel>Name</FormLabel>
              <Input
                autoFocus
                placeholder="My playlist"
                value={newName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Description</FormLabel>
              <Input
                placeholder="Optional"
                value={newDesc}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewDesc(e.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Type</FormLabel>
              <RadioGroup
                orientation="horizontal"
                value={newType}
                onChange={(event) => setNewType((event.target as HTMLInputElement).value as "MANUAL" | "SMART")}
                sx={{ gap: 2 }}
              >
                <Radio value="MANUAL" label="Manual" />
                <Radio value="SMART" label="Smart" />
              </RadioGroup>
            </FormControl>
            <Box sx={{ p: 2, bgcolor: 'neutral.softBg', borderRadius: 'sm' }}>
              <Typography level="body-sm" color="neutral">
                💡 You can add a cover image after creating the playlist by using the edit button.
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" gap={1.5} justifyContent="flex-end" sx={{ pt: 2 }}>
            <Button variant="plain" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createPlaylist} disabled={!newName.trim()}>
              Create
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={isDeleteOpen} onClose={() => setIsDeleteOpen(false)}>
        <ModalDialog aria-labelledby="confirm-delete" variant="outlined">
          <ModalClose />
          <Typography id="confirm-delete" level="title-lg">
            Delete playlist?
          </Typography>
          <Divider />
          <Typography level="body-sm" sx={{ mt: 1 }}>
            This action cannot be undone.
          </Typography>
          <Stack direction="row" gap={1.5} justifyContent="flex-end" sx={{ pt: 2 }}>
            <Button variant="plain" onClick={() => setIsDeleteOpen(false)}>
              No
            </Button>
            <Button color="danger" onClick={deletePlaylist}>
              Yes, delete
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
