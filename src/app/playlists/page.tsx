"use client";

import { useState, useEffect, ChangeEvent } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { useStashTags } from "@/context/StashTagsContext"; // ensure this path matches your project

type PlaylistType = "MANUAL" | "SMART";

interface Playlist {
  id: string;
  name: string;
  description?: string;
  type: PlaylistType;
}

type PlaylistStats = {
  itemCount: number;
  durationMs?: number;
};

type ParsedConds = {
  actors: string[]; // names
  tags: string[];   // names
};

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
          return [p.id, { actors: actorNames, tags: tagNames } as ParsedConds] as const;
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
      if (created.type === "SMART") setConds((prev) => ({ ...prev, [created.id]: { actors: [], tags: [] } }));
      resetCreateForm();
      setIsCreateOpen(false);
    }
  };

  const confirmDelete = (id: string) => {
    setToDeleteId(id);
    setIsDeleteOpen(true);
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
      // (no need to re-fetch conditions—they don’t change on refresh)
    } catch (e) {
      console.error("Refresh failed", e);
    } finally {
      setRefreshing((r) => ({ ...r, [playlistId]: false }));
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

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1280, mx: "auto" }}>
      {/* Header: title left, button right */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography level="h3">Playlists</Typography>
        <Button startDecorator={<Plus size={16} />} color="primary" variant="solid" onClick={() => setIsCreateOpen(true)}>
          Add Playlist
        </Button>
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
            You haven’t added any playlists yet.
          </Typography>
          <Typography level="body-sm" sx={{ mb: 2 }}>
            Create your first manual or smart playlist to get started.
          </Typography>
          <Button startDecorator={<Plus size={16} />} onClick={() => setIsCreateOpen(true)}>
            Add Playlist
          </Button>
        </Sheet>
      )}

      <Grid container spacing={2}>
        {playlists.map((playlist) => {
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
            <Grid xs={12} sm={6} lg={6} key={playlist.id}>
              <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <CardContent sx={{ gap: 1, display: "flex", flexDirection: "column" }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
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
                        {playlist.description?.trim() || "No description"}
                      </Typography>
                    </Box>
                    <Chip size="sm" variant="soft" color={typeColor[playlist.type]} sx={{ textTransform: "capitalize", flexShrink: 0 }}>
                      {playlist.type.toLowerCase()}
                    </Chip>
                  </Stack>

                  {/* Stats row */}
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Chip size="sm" variant="outlined" startDecorator={<Film size={14} />}>
                      {s ? `${s.itemCount} item${s.itemCount === 1 ? "" : "s"}` : "…"}
                    </Chip>
                    {durationLabel && (
                      <Chip size="sm" variant="outlined" startDecorator={<Clock size={14} />}>
                        {durationLabel}
                      </Chip>
                    )}
                  </Stack>

                  {/* SMART conditions row */}
                  {isSmart && (
                    <Stack spacing={0.75} sx={{ mt: 1 }}>
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
                    </Stack>
                  )}
                </CardContent>

                <Divider />

                <CardActions sx={{ mt: "auto", justifyContent: "space-between" }}>
                  <Button size="sm" variant="plain" onClick={() => router.push(`/playlists/${playlist.id}`)}>
                    Open
                  </Button>

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
