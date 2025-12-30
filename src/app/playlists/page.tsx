// file: src/app/playlists/page.tsx
"use client";

import { useState, useEffect, ChangeEvent, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Checkbox,
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
  Typography,
} from "@mui/joy";
import {
  Plus,
  RefreshCcw,
  Search,
  ArrowUpDown,
  CheckSquare,
  X,
  Trash2,
} from "lucide-react";
import { useStashTags } from "@/context/StashTagsContext";
import PlaylistCard, {
  Playlist,
  PlaylistStats,
  ParsedConds,
  PlaylistType,
} from "@/components/PlaylistCard";

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
  const [hideEmpty, setHideEmpty] = useState(true);

  // Create dialog
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<PlaylistType>("SMART");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Delete dialog
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<string | null>(null);

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
    setNewType("SMART");
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
      resetCreateForm();
      setIsCreateOpen(false);

      // Navigate to the appropriate playlist editor
      const returnTo = encodeURIComponent('/playlists');
      router.push(`/playlists/edit/${newType.toLowerCase()}/${created.id}?returnTo=${returnTo}`);
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

  // Selection mode helpers
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    const visibleIds = filteredAndSortedPlaylists.map((p) => p.id);
    setSelectedIds(new Set(visibleIds));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);

    const results = await Promise.allSettled(
      Array.from(selectedIds).map(async (id) => {
        const response = await fetch(`/api/playlists?id=${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error(`Failed to delete ${id}`);
        return id;
      })
    );

    // Remove successfully deleted playlists from state
    const deletedIds = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map((r) => r.value);

    setPlaylists((prev) => prev.filter((p) => !deletedIds.includes(p.id)));

    setBulkDeleting(false);
    setIsBulkDeleteOpen(false);
    exitSelectionMode();
  };

  // Get names of selected playlists for confirmation dialog
  const selectedPlaylistNames = useMemo(() => {
    return playlists
      .filter((p) => selectedIds.has(p.id))
      .map((p) => p.name);
  }, [playlists, selectedIds]);

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

    // Apply hide empty filter
    if (hideEmpty) {
      filtered = filtered.filter(playlist => {
        const playlistStats = stats[playlist.id];
        return playlistStats && playlistStats.itemCount > 0;
      });
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
  }, [playlists, stats, searchQuery, sortOption, hideEmpty]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: "auto" }}>
      {/* Header with title, search, sort, and add button */}
      <Stack spacing={2} sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography level="h3">Playlists</Typography>
            {selectionMode && selectedIds.size > 0 && (
              <Chip size="sm" variant="soft" color="primary">
                {selectedIds.size} selected
              </Chip>
            )}
          </Stack>
          <Stack direction="row" spacing={1}>
            {selectionMode ? (
              <>
                {/* Selection mode controls */}
                <Button
                  size="sm"
                  variant="plain"
                  onClick={selectAll}
                >
                  Select All
                </Button>
                <Button
                  size="sm"
                  variant="plain"
                  onClick={deselectAll}
                  disabled={selectedIds.size === 0}
                >
                  Deselect All
                </Button>
                {selectedIds.size > 0 && (
                  <Button
                    startDecorator={<Trash2 size={16} />}
                    color="danger"
                    variant="solid"
                    onClick={() => setIsBulkDeleteOpen(true)}
                  >
                    Delete ({selectedIds.size})
                  </Button>
                )}
                <Button
                  startDecorator={<X size={16} />}
                  color="neutral"
                  variant="outlined"
                  onClick={exitSelectionMode}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                {/* Normal mode controls */}
                <Button
                  startDecorator={<CheckSquare size={16} />}
                  color="neutral"
                  variant="outlined"
                  onClick={() => setSelectionMode(true)}
                >
                  Select
                </Button>
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
              </>
            )}
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

          <Checkbox
            label="Hide empty"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
            size="sm"
          />

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
        {filteredAndSortedPlaylists.map((playlist) => (
          <Grid xs={12} sm={6} lg={4} key={playlist.id}>
            <PlaylistCard
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
          </Grid>
        ))}
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
                onChange={(event) => setNewType((event.target as HTMLInputElement).value as "SMART" | "MANUAL")}
                sx={{ gap: 2 }}
              >
                <Radio value="SMART" label="Smart" />
                <Radio value="MANUAL" label="Manual" />
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

      {/* Bulk Delete Confirmation Modal */}
      <Modal open={isBulkDeleteOpen} onClose={() => !bulkDeleting && setIsBulkDeleteOpen(false)}>
        <ModalDialog aria-labelledby="confirm-bulk-delete" variant="outlined" sx={{ minWidth: 400, maxWidth: 500 }}>
          {!bulkDeleting && <ModalClose />}
          <Typography id="confirm-bulk-delete" level="title-lg">
            Delete {selectedIds.size} playlist{selectedIds.size === 1 ? "" : "s"}?
          </Typography>
          <Divider />
          <Typography level="body-sm" sx={{ mt: 1 }}>
            This action cannot be undone. All items in these playlists will be removed.
          </Typography>
          {selectedPlaylistNames.length > 0 && (
            <Box
              sx={{
                mt: 2,
                p: 1.5,
                bgcolor: "neutral.softBg",
                borderRadius: "sm",
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              <Typography level="body-xs" sx={{ mb: 1, fontWeight: "bold" }}>
                Playlists to delete:
              </Typography>
              {selectedPlaylistNames.map((name, idx) => (
                <Typography key={idx} level="body-sm" sx={{ py: 0.25 }}>
                  • {name}
                </Typography>
              ))}
            </Box>
          )}
          <Stack direction="row" gap={1.5} justifyContent="flex-end" sx={{ pt: 2 }}>
            <Button
              variant="plain"
              onClick={() => setIsBulkDeleteOpen(false)}
              disabled={bulkDeleting}
            >
              Cancel
            </Button>
            <Button
              color="danger"
              onClick={bulkDelete}
              loading={bulkDeleting}
            >
              {bulkDeleting ? "Deleting..." : "Delete All"}
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
