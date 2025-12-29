// src/app/actors/[id]/playlists/page.tsx
"use client";

import { useState, useEffect, ChangeEvent, useMemo } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useStashTags } from "@/context/StashTagsContext";
import PlaylistCard, {
  Playlist,
  PlaylistStats,
  ParsedConds,
} from "@/components/PlaylistCard";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormLabel,
  Grid,
  Input,
  LinearProgress,
  Modal,
  ModalClose,
  ModalDialog,
  Radio,
  RadioGroup,
  Sheet,
  Stack,
  Typography,
} from "@mui/joy";
import { PlaylistType } from "@/components/PlaylistCard";
import { Plus, Search, Layers } from "lucide-react";
import BuildPlaylistsDialog from "@/components/BuildPlaylistsDialog";

export default function ActorPlaylistsPage() {
  const params = useParams<{ id: string }>();
  const actorId = params.id;
  const router = useRouter();
  const pathname = usePathname();

  // Tab state
  const isPlaylistsPage = pathname?.includes("/playlists");
  const isScenesPage = pathname?.includes("/scenes");

  const { stashTags } = useStashTags();

  // Playlist state
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-playlist stats and conditions
  const [stats, setStats] = useState<Record<string, PlaylistStats>>({});
  const [conds, setConds] = useState<Record<string, ParsedConds>>({});

  // Per-playlist "refreshing" state
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [hideEmpty, setHideEmpty] = useState(true);

  // Create dialog
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<PlaylistType>("SMART");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Delete dialog
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<string | null>(null);

  // Build from templates dialog
  const [isBuildOpen, setIsBuildOpen] = useState(false);
  const [actorName, setActorName] = useState<string>("");

  // Initial load - fetch playlists for this actor
  useEffect(() => {
    if (!actorId) return;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/actors/${actorId}/playlists`);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const data = await res.json();
        setPlaylists(data);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load playlists");
      } finally {
        setLoading(false);
      }
    })();
  }, [actorId]);

  // Fetch actor name for build dialog
  useEffect(() => {
    if (!actorId) return;

    (async () => {
      try {
        const res = await fetch(`/api/actors/${actorId}`);
        if (res.ok) {
          const data = await res.json();
          setActorName(data.name || "");
        }
      } catch (e) {
        console.error("Failed to fetch actor:", e);
      }
    })();
  }, [actorId]);

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
  }, [playlists, stashTags]);

  // Helpers
  const resetCreateForm = () => {
    setNewName("");
    setNewDesc("");
    setNewType("SMART");
  };

  const createPlaylist = async () => {
    if (!newName.trim() || !actorId) return;

    // Build request body based on type
    const body: any = {
      name: newName.trim(),
      description: newDesc.trim(),
      type: newType,
    };

    // For SMART playlists, pre-select this actor
    if (newType === "SMART") {
      body.conditions = { actorIds: [actorId] };
    }

    const response = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      const created = await response.json();
      setPlaylists((prev) => [created, ...prev]);
      // optimistic seeds
      setStats((prev) => ({ ...prev, [created.id]: { itemCount: 0, durationMs: 0 } }));
      if (created.type === "SMART") {
        setConds((prev) => ({ ...prev, [created.id]: { actors: [], tags: [], minRating: null } }));
      }
      resetCreateForm();
      setIsCreateOpen(false);

      // Navigate to the appropriate playlist editor with return URL
      const returnTo = encodeURIComponent(`/actors/${actorId}/playlists`);
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

  // Refresh a SMART playlist
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
    } catch (e) {
      console.error("Refresh failed", e);
    } finally {
      setRefreshing((r) => ({ ...r, [playlistId]: false }));
    }
  };

  // Filtered playlists
  const filteredPlaylists = useMemo(() => {
    let filtered = playlists;

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(playlist =>
        playlist.name.toLowerCase().includes(query) ||
        (playlist.description && playlist.description.toLowerCase().includes(query))
      );
    }

    if (hideEmpty) {
      filtered = filtered.filter(playlist => {
        const playlistStats = stats[playlist.id];
        return playlistStats && playlistStats.itemCount > 0;
      });
    }

    return filtered;
  }, [playlists, searchQuery, hideEmpty, stats]);

  return (
    <Sheet sx={{ p: 2, maxWidth: "90vw", mx: "auto" }}>
      {/* Header / Nav */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexGrow: 1, mb: 2 }}>
        <Link href={`/actors/${actorId}/playlists`} passHref>
          <Button
            size="sm"
            variant={isPlaylistsPage ? "solid" : "soft"}
          >
            Playlists
          </Button>
        </Link>
        <Link href={`/actors/${actorId}`} passHref>
          <Button
            size="sm"
            variant={!isPlaylistsPage && !isScenesPage ? "solid" : "soft"}
          >
            Markers
          </Button>
        </Link>
        <Link href={`/actors/${actorId}/scenes`} passHref>
          <Button
            size="sm"
            variant={isScenesPage ? "solid" : "soft"}
          >
            Scenes
          </Button>
        </Link>
      </Box>

      {/* Search and Add button */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ xs: "stretch", sm: "center" }}
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexGrow: 1 }}>
          <FormControl sx={{ flexGrow: 1, maxWidth: { sm: 300 } }}>
            <Input
              placeholder="Search playlists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              startDecorator={<Search size={16} />}
              size="sm"
            />
          </FormControl>
          <Checkbox
            label="Hide empty"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
            size="sm"
          />
        </Box>

        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            startDecorator={<Layers size={16} />}
            color="primary"
            variant="soft"
            size="sm"
            onClick={() => setIsBuildOpen(true)}
            disabled={!actorName}
          >
            Build from Templates
          </Button>
          <Button
            startDecorator={<Plus size={16} />}
            color="primary"
            variant="solid"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
          >
            Add Playlist
          </Button>
        </Box>
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
            No playlists for this actor yet.
          </Typography>
          <Typography level="body-sm" sx={{ mb: 2 }}>
            Create a smart playlist to get started.
          </Typography>
          <Button startDecorator={<Plus size={16} />} onClick={() => setIsCreateOpen(true)}>
            Add Playlist
          </Button>
        </Sheet>
      )}

      {!loading && playlists.length > 0 && filteredPlaylists.length === 0 && (
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
        </Sheet>
      )}

      <Grid container spacing={2}>
        {filteredPlaylists.map((playlist) => (
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
              hideActorFilter={true}
              returnTo={`/actors/${actorId}/playlists`}
            />
          </Grid>
        ))}
      </Grid>

      {/* Create Playlist Modal */}
      <Modal open={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <ModalDialog aria-labelledby="create-playlist" sx={{ minWidth: 420 }}>
          <ModalClose />
          <Typography id="create-playlist" level="title-lg">
            Create Playlist for Actor
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
                onChange={(event) => setNewType((event.target as HTMLInputElement).value as PlaylistType)}
                sx={{ gap: 2 }}
              >
                <Radio value="SMART" label="Smart" />
                <Radio value="MANUAL" label="Manual" />
              </RadioGroup>
            </FormControl>
            <Box sx={{ p: 2, bgcolor: 'neutral.softBg', borderRadius: 'sm' }}>
              <Typography level="body-sm" color="neutral">
                {newType === "SMART"
                  ? "A smart playlist will be created with this actor pre-selected. You can add more conditions in the editor."
                  : "A manual playlist will be created. You can add items manually in the editor."}
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

      {/* Build from Templates Dialog */}
      <BuildPlaylistsDialog
        open={isBuildOpen}
        onClose={() => setIsBuildOpen(false)}
        actorId={actorId}
        actorName={actorName}
        onSuccess={async () => {
          // Refresh playlists after building
          try {
            const res = await fetch(`/api/actors/${actorId}/playlists`);
            if (res.ok) {
              const data = await res.json();
              setPlaylists(data);
            }
          } catch (e) {
            console.error("Failed to refresh playlists:", e);
          }
        }}
      />
    </Sheet>
  );
}
