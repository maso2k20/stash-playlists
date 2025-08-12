// filepath: src/app/scenes/[id]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, gql } from "@apollo/client";
import {
    Container,
    Sheet,
    Box,
    Typography,
    Card,
    Chip,
    Divider,
    Skeleton,
    Input,
    Button,
    Autocomplete,
    Checkbox,
    Grid,
    IconButton,
    Tooltip,
    Modal,
    ModalDialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from "@mui/joy";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import DeleteIcon from "@mui/icons-material/Delete";
import { useStashTags } from "@/context/StashTagsContext";
import { useSettings } from "@/app/context/SettingsContext";
import VideoJS from "@/components/videojs/VideoJS";
import TimeInput from "@/components/TimeInput";

/* Query: scene with markers + tags */
const GET_SCENE_FOR_TAG_MANAGEMENT = gql`
  query getSceneForTagManagement($id: ID!) {
    findScene(id: $id) {
      id
      title
      paths { screenshot vtt }
      tags { id name }
      scene_markers {
        id
        title
        seconds
        end_seconds
        primary_tag { id name }
        tags { id name }
      }
    }
  }
`;

/* Mutations */
const UPDATE_SCENE_MARKER = gql`
  mutation updateSceneMarker($input: SceneMarkerUpdateInput!) {
    sceneMarkerUpdate(input: $input) {
      id
      title
      seconds
      end_seconds
      primary_tag { id name }
      tags { id name }
    }
  }
`;

const CREATE_SCENE_MARKER = gql`
  mutation createSceneMarker($input: SceneMarkerCreateInput!) {
    sceneMarkerCreate(input: $input) {
      id
      title
      seconds
      end_seconds
      primary_tag { id name }
      tags { id name }
    }
  }
`;

const DELETE_SCENE_MARKER = gql`
  mutation deleteSceneMarker($id: ID!) {
    sceneMarkerDestroy(id: $id)
  }
`;

const UPDATE_SCENE = gql`
  mutation updateScene($input: SceneUpdateInput!) {
    sceneUpdate(input: $input) {
      id
      tags { id name }
    }
  }
`;

type Tag = { id: string; name: string };
type Marker = {
    id: string;
    title: string;
    seconds: number;
    end_seconds: number | null;
    primary_tag?: Tag | null;
    tags?: Tag[];
};
type Draft = {
    title: string;
    seconds: number;
    end_seconds: number | null;
    primary_tag_id: string | null;
    tag_ids: string[];
};

function joinUrl(base?: string, path?: string) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    if (!base) return path;
    return `${base.replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

function withApiKey(url: string, apiKey?: string) {
    if (!url || !apiKey) return url;
    return /[?&]api_key=/.test(url) ? url : `${url}${url.includes("?") ? "&" : "?"}api_key=${apiKey}`;
}

export default function SceneTagManagerPage() {
    const params = useParams<{ id: string }>();
    const sceneId = params.id;

    const { data, loading, error, refetch } = useQuery(GET_SCENE_FOR_TAG_MANAGEMENT, {
        variables: { id: sceneId },
        fetchPolicy: "cache-and-network",
    });

    const [updateSceneMarker] = useMutation(UPDATE_SCENE_MARKER);
    const [createSceneMarker] = useMutation(CREATE_SCENE_MARKER);
    const [deleteSceneMarker] = useMutation(DELETE_SCENE_MARKER);
    const [updateScene] = useMutation(UPDATE_SCENE);

    const scene = data?.findScene;
    const markers: Marker[] = (scene?.scene_markers ?? []) as any;

    // Tag options from context
    const { stashTags, loading: tagsLoading } = useStashTags();
    const tagOptions: Tag[] = useMemo(
        () => (stashTags || []).map((t: any) => ({ id: String(t.id), name: String(t.name) })),
        [stashTags]
    );

    // Settings for stream URL
    const settings = useSettings();
    const stashServer = String(settings["STASH_SERVER"] || "").replace(/\/+$/, "");
    const stashAPI = String(settings["STASH_API"] || "");
    // Stabilize streamUrl and posterUrl to prevent video jumping on marker updates
    const streamUrl = useMemo(() => {
        return sceneId ? `${stashServer}/scene/${sceneId}/stream?api_key=${stashAPI}` : "";
    }, [sceneId, stashServer, stashAPI]);

    const [initialScreenshotPath, setInitialScreenshotPath] = useState<string>("");
    
    // Reset screenshot path when scene ID changes, then set it when scene loads
    useEffect(() => {
        setInitialScreenshotPath("");
    }, [sceneId]);

    useEffect(() => {
        if (scene?.paths?.screenshot && !initialScreenshotPath) {
            setInitialScreenshotPath(scene.paths.screenshot);
        }
    }, [scene?.paths?.screenshot, initialScreenshotPath]);

    const posterUrl = useMemo(() => {
        const raw = initialScreenshotPath || "";
        const abs = joinUrl(stashServer, raw);
        const withKey = withApiKey(abs, stashAPI);
        return withKey || undefined; // undefined avoids a broken img if empty
    }, [initialScreenshotPath, stashServer, stashAPI]);

    // ----- State -----
    // Drafts for BOTH server markers and new temporary rows (by id)
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [savingAll, setSavingAll] = useState(false);

    // New (unsaved) marker ids; their ids are "tmp_..."
    const [newIds, setNewIds] = useState<string[]>([]);

    // Common Tags state
    const [commonTagIds, setCommonTagIds] = useState<string[]>([]);
    const [removeCommonMode, setRemoveCommonMode] = useState<boolean>(false);

    // VideoJS refs
    const playerRef = useRef<any>(null);
    const [playerReady, setPlayerReady] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);

    // Delete confirmation dialog
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [markerToDelete, setMarkerToDelete] = useState<{ id: string; title: string } | null>(null);

    // Init drafts from server markers
    useEffect(() => {
        const next: Record<string, Draft> = {};
        for (const m of markers) {
            next[m.id] = {
                title: m.title || "",
                seconds: Number(m.seconds || 0),
                end_seconds: m.end_seconds != null ? Number(m.end_seconds) : null,
                primary_tag_id: m.primary_tag?.id ?? null,
                tag_ids: (m.tags || []).map((t) => t.id),
            };
        }
        setDrafts((prev) => {
            // keep any existing tmp drafts, overwrite server ids
            const keepTmp: Record<string, Draft> = {};
            for (const id of Object.keys(prev)) {
                if (id.startsWith("tmp_")) keepTmp[id] = prev[id];
            }
            return { ...keepTmp, ...next };
        });
    }, [markers.length]);

    useEffect(() => {
        const p = playerRef.current;
        if (!p) return;
        // Video.js treats "" as "no poster"
        p.poster(posterUrl || "");
    }, [posterUrl]);

    const setDraft = (id: string, patch: Partial<Draft>) =>
        setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || ({} as Draft)), ...patch } }));

    const eqShallowSet = (a: string[], b: string[]) => {
        if (a.length !== b.length) return false;
        const aa = [...a].sort();
        const bb = [...b].sort();
        for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
        return true;
    };

    const isDirtyExisting = (m: Marker, d: Draft) => {
        const server = {
            title: m.title || "",
            seconds: Number(m.seconds || 0),
            end_seconds: m.end_seconds != null ? Number(m.end_seconds) : null,
            primary_tag_id: m.primary_tag?.id ?? null,
            tag_ids: (m.tags || []).map((t) => t.id),
        };
        return (
            d.title !== server.title ||
            d.seconds !== server.seconds ||
            (d.end_seconds ?? null) !== (server.end_seconds ?? null) ||
            d.primary_tag_id !== server.primary_tag_id ||
            !eqShallowSet(d.tag_ids, server.tag_ids)
        );
    };


    const normalizedTagIds = (d: Draft) =>
        d.primary_tag_id ? Array.from(new Set([d.primary_tag_id, ...d.tag_ids])) : d.tag_ids;

    const isTemp = (id: string) => id.startsWith("tmp_");

    // Find tag ID by name from available tags
    const findTagIdByName = (tagName: string): string | null => {
        const tag = tagOptions.find(t => t.name === tagName);
        return tag?.id || null;
    };

    // Add "Markers Organised" tag to the scene
    const addMarkersOrganisedTag = async () => {
        const markersOrganisedTagId = findTagIdByName("Markers Organised");
        if (!markersOrganisedTagId || !scene) return;

        // Check if scene already has this tag
        const currentTagIds = (scene.tags || []).map((t: Tag) => t.id);
        if (currentTagIds.includes(markersOrganisedTagId)) return;

        try {
            await updateScene({
                variables: {
                    input: {
                        id: sceneId,
                        tag_ids: [...currentTagIds, markersOrganisedTagId]
                    }
                }
            });
        } catch (e) {
            console.error("Failed to add 'Markers Organised' tag:", e);
        }
    };

    // Save existing (update) OR new (create)
    const handleSaveRow = async (id: string) => {
        const d = drafts[id];
        if (!d) return;

        if (isTemp(id)) {
            try {
                setSavingId(id);
                await createSceneMarker({
                    variables: {
                        input: {
                            scene_id: sceneId,
                            title: d.title,
                            seconds: Math.max(0, Number(d.seconds) || 0),
                            end_seconds:
                                typeof d.end_seconds === "number" && Number.isFinite(d.end_seconds)
                                    ? Math.max(0, Number(d.end_seconds))
                                    : null,
                            primary_tag_id: d.primary_tag_id,
                            tag_ids: normalizedTagIds(d),
                        },
                    },
                });
                // Remove temp
                setNewIds((prev) => prev.filter((x) => x !== id));
                setDrafts((prev) => {
                    const { [id]: _, ...rest } = prev;
                    return rest;
                });
                await addMarkersOrganisedTag();
                // Delay refetch to prevent video jumping
                setTimeout(() => refetch(), 100);
            } catch (e) {
                console.error("Failed to create marker:", e);
            } finally {
                setSavingId(null);
            }
        } else {
            // existing -> update
            try {
                setSavingId(id);
                await updateSceneMarker({
                    variables: {
                        input: {
                            id,
                            title: d.title,
                            seconds: Math.max(0, Number(d.seconds) || 0),
                            end_seconds:
                                typeof d.end_seconds === "number" && Number.isFinite(d.end_seconds)
                                    ? Math.max(0, Number(d.end_seconds))
                                    : null,
                            primary_tag_id: d.primary_tag_id,
                            tag_ids: normalizedTagIds(d),
                        },
                    },
                });
                await addMarkersOrganisedTag();
                // Delay refetch to prevent video jumping
                setTimeout(() => refetch(), 100);
            } catch (e) {
                console.error("Failed to update marker:", e);
            } finally {
                setSavingId(null);
            }
        }
    };

    const handleResetRow = (id: string) => {
        if (isTemp(id)) {
            // discard new row
            setNewIds((prev) => prev.filter((x) => x !== id));
            setDrafts((prev) => {
                const { [id]: _, ...rest } = prev;
                return rest;
            });
            return;
        }
        // reset existing row to server state
        const m = markers.find((mm) => mm.id === id);
        if (!m) return;
        setDrafts((prev) => ({
            ...prev,
            [id]: {
                title: m.title || "",
                seconds: Number(m.seconds || 0),
                end_seconds: m.end_seconds != null ? Number(m.end_seconds) : null,
                primary_tag_id: m.primary_tag?.id ?? null,
                tag_ids: (m.tags || []).map((t) => t.id),
            },
        }));
    };

    const handleDeleteRow = (id: string) => {
        if (isTemp(id)) {
            // Just remove temp row
            setNewIds((prev) => prev.filter((x) => x !== id));
            setDrafts((prev) => {
                const { [id]: _, ...rest } = prev;
                return rest;
            });
            return;
        }

        // Show confirmation dialog for existing markers
        const marker = markers.find((m) => m.id === id);
        const markerTitle = marker?.title || "Untitled Marker";
        setMarkerToDelete({ id, title: markerTitle });
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!markerToDelete) return;

        try {
            setSavingId(markerToDelete.id);
            await deleteSceneMarker({
                variables: { id: markerToDelete.id }
            });
            // Remove from drafts
            setDrafts((prev) => {
                const { [markerToDelete.id]: _, ...rest } = prev;
                return rest;
            });
            // Delay refetch to prevent video jumping
            setTimeout(() => refetch(), 100);
        } catch (e) {
            console.error("Failed to delete marker:", e);
        } finally {
            setSavingId(null);
            setDeleteDialogOpen(false);
            setMarkerToDelete(null);
        }
    };

    const cancelDelete = () => {
        setDeleteDialogOpen(false);
        setMarkerToDelete(null);
    };

    // Save All / Reset All must include temp rows as well
    const dirtyExistingEntries = useMemo(
        () =>
            markers
                .map((m) => ({ id: m.id, m, d: drafts[m.id] }))
                .filter(({ d }) => !!d)
                .filter(({ m, d }) => isDirtyExisting(m, d!)),
        [markers, drafts]
    );

    const newEntries = useMemo(
        () => newIds.map((id) => ({ id, d: drafts[id] })).filter(({ d }) => !!d),
        [newIds, drafts]
    );

    const dirtyCount = dirtyExistingEntries.length + newEntries.length;

    const handleSaveAll = async () => {
        if (!dirtyCount) return;
        setSavingAll(true);
        try {
            // Handle all mutations sequentially 
            // Create all new markers
            for (const { id, d } of newEntries) {
                await createSceneMarker({
                    variables: {
                        input: {
                            scene_id: sceneId,
                            title: d!.title,
                            seconds: Math.max(0, Number(d!.seconds) || 0),
                            end_seconds:
                                typeof d!.end_seconds === "number" && Number.isFinite(d!.end_seconds)
                                    ? Math.max(0, Number(d!.end_seconds))
                                    : null,
                            primary_tag_id: d!.primary_tag_id,
                            tag_ids: normalizedTagIds(d!),
                        },
                    },
                });
            }

            // Update all dirty existing markers
            for (const { id, d } of dirtyExistingEntries) {
                await updateSceneMarker({
                    variables: {
                        input: {
                            id,
                            title: d!.title,
                            seconds: Math.max(0, Number(d!.seconds) || 0),
                            end_seconds:
                                typeof d!.end_seconds === "number" && Number.isFinite(d!.end_seconds)
                                    ? Math.max(0, Number(d!.end_seconds))
                                    : null,
                            primary_tag_id: d!.primary_tag_id,
                            tag_ids: normalizedTagIds(d!),
                        },
                    },
                });
            }

            // Clear temps
            setNewIds([]);
            setDrafts((prev) => {
                const next = { ...prev };
                for (const id of Object.keys(next)) if (isTemp(id)) delete next[id];
                return next;
            });
            await addMarkersOrganisedTag();
            // Delay refetch to prevent video jumping
            setTimeout(() => refetch(), 100);
        } catch (e) {
            console.error("Save all failed:", e);
        } finally {
            setSavingAll(false);
        }
    };

    const handleResetAll = () => {
        // discard all new
        setNewIds([]);
        setDrafts((prev) => {
            const kept: Record<string, Draft> = {};
            for (const [k, v] of Object.entries(prev)) if (!isTemp(k)) kept[k] = v;
            return kept;
        });
        // reset all existing
        const next: Record<string, Draft> = {};
        for (const m of markers) {
            next[m.id] = {
                title: m.title || "",
                seconds: Number(m.seconds || 0),
                end_seconds: m.end_seconds != null ? Number(m.end_seconds) : null,
                primary_tag_id: m.primary_tag?.id ?? null,
                tag_ids: (m.tags || []).map((t) => t.id),
            };
        }
        setDrafts((prev) => ({ ...prev, ...next }));
    };

    // Common tags apply (Add or Remove) — apply to both existing + new rows
    const handleApplyCommonToAll = () => {
        if (commonTagIds.length === 0) return;
        setDrafts((prev) => {
            const next: typeof prev = { ...prev };
            const allIds = new Set<string>([...newIds, ...markers.map((m) => m.id)]);
            for (const id of allIds) {
                const d = next[id];
                if (!d) continue;
                if (removeCommonMode) {
                    d.tag_ids = d.tag_ids.filter((tid) => !commonTagIds.includes(tid));
                } else {
                    d.tag_ids = Array.from(new Set([...d.tag_ids, ...commonTagIds]));
                }
            }
            return next;
        });
    };

    // ---- VideoJS: options + ref ----
    const videoJsOptions = useMemo(
        () => ({
            autoplay: false,
            controls: true,
            responsive: true,
            fluid: true,
            aspectRatio: "16:9",
            poster: posterUrl,
            sources: streamUrl ? [{ src: streamUrl, type: "video/mp4" }] : [],
        }),
        [streamUrl, posterUrl]
    );

    const handlePlayerReady = (player: any) => {
        playerRef.current = player;
        player.muted(true);
        if (posterUrl) player.poster(posterUrl);
        setPlayerReady(true);
    };

    // Seek the VideoJS player to a time & play
    const jumpTo = (sec: number) => {
        const player = playerRef.current;
        if (!player || typeof sec !== "number") return;
        const target = Math.max(0, sec);
        if (player.readyState && player.readyState() < 1) {
            player.one?.("loadedmetadata", () => {
                player.currentTime(target);
                player.play();
            });
        } else {
            player.currentTime(target);
            player.play();
        }
    };

    // Current time helper (rounded seconds)
    const currentPlayerSecond = () => {
        try {
            const t = playerRef.current?.currentTime?.();
            const n = Number(t);
            return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
        } catch {
            return 0;
        }
    };

    // Removed handleCardClick - only the Jump button should trigger video seeking

    // Add a new inline marker row
    const addNewInline = () => {
        const id = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const start = currentPlayerSecond();
        const defaultTitle = scene?.title || "New Marker";
        setDrafts((prev) => ({
            ...prev,
            [id]: {
                title: defaultTitle,
                seconds: start,
                end_seconds: null,
                primary_tag_id: null,
                tag_ids: [],
            },
        }));
        setNewIds((prev) => [id, ...prev]);
    };

    // Build render order: new drafts first, then server markers
    const markerMap = useMemo(() => {
        const m = new Map<string, Marker>();
        for (const mk of markers) m.set(mk.id, mk);
        return m;
    }, [markers]);
    const newIdsSet = useMemo(() => new Set(newIds), [newIds]);
    const renderIds = [...newIds, ...markers.map((m) => m.id)];

    // Can the clock buttons read time?
    const canReadPlayerTime = playerReady && !!playerRef.current?.currentTime;

    return (
        <Container maxWidth={false} sx={{ px: { xs: 1.5, sm: 2, lg: 3 }, py: 2 }}>
            <Sheet sx={{ p: 0 }}>
                {/* Title */}
                {loading ? (
                    <Skeleton variant="text" level="h2" width="40%" sx={{ mb: 1.5 }} />
                ) : error ? (
                    <Typography color="danger" level="body-sm" sx={{ mb: 1.5 }}>
                        {error.message}
                    </Typography>
                ) : (
                    <Typography level="h2" sx={{ mb: 1.5 }}>
                        {scene?.title || "Scene"}
                    </Typography>
                )}

                <Grid container spacing={2}>
                    {/* LEFT: Marker editor (50%) */}
                    <Grid xs={12} md={6}>
                        <Card variant="outlined" sx={{ p: 1.25, borderRadius: "lg" }}>
                            {/* Row: header + bulk actions */}
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
                                <Typography level="title-md">Markers</Typography>
                                {!loading && (
                                    <Chip size="sm" variant="soft">
                                        {markers.length + newIds.length}
                                    </Chip>
                                )}
                                <Box sx={{ flexGrow: 1 }} />
                                <Button size="sm" variant="outlined" onClick={addNewInline}>
                                    New Marker
                                </Button>
                                {dirtyCount > 0 && (
                                    <Chip size="sm" variant="soft" color="warning">
                                        {dirtyCount} unsaved
                                    </Chip>
                                )}
                                <Button
                                    size="sm"
                                    variant="plain"
                                    disabled={!dirtyCount}
                                    onClick={handleResetAll}
                                >
                                    Reset All
                                </Button>
                                <Button size="sm" disabled={!dirtyCount || savingAll} onClick={handleSaveAll}>
                                    {savingAll ? "Saving…" : "Save All"}
                                </Button>
                            </Box>

                            <Divider />

                            {/* Editable list */}
                            <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 1 }}>
                                {loading || tagsLoading ? (
                                    Array.from({ length: 6 }).map((_, i) => (
                                        <Card key={i} variant="soft" sx={{ p: 1.25 }}>
                                            <Skeleton variant="text" level="title-sm" width="40%" />
                                            <Box
                                                sx={{
                                                    display: "grid",
                                                    gap: 0.75,
                                                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
                                                    mt: 0.75,
                                                }}
                                            >
                                                <Skeleton variant="text" level="body-sm" width="80%" />
                                                <Skeleton variant="text" level="body-sm" width="80%" />
                                                <Skeleton variant="text" level="body-sm" width="80%" />
                                            </Box>
                                        </Card>
                                    ))
                                ) : renderIds.length === 0 ? (
                                    <Sheet
                                        variant="soft"
                                        color="neutral"
                                        sx={{ p: 2, borderRadius: "md", textAlign: "center", mt: 1 }}
                                    >
                                        <Typography level="title-sm">No markers on this scene.</Typography>
                                    </Sheet>
                                ) : (
                                    renderIds.map((id) => {
                                        const isNew = newIdsSet.has(id);
                                        const m = isNew ? undefined : markerMap.get(id);
                                        const d = drafts[id];
                                        if (!d) return null;

                                        const dirty = isNew || (m ? isDirtyExisting(m, d) : true);
                                        const savingThis = savingId === id;
                                        const otherTagIds = d.tag_ids.filter((tid) => tid !== d.primary_tag_id);

                                        return (
                                            <Card
                                                key={id}
                                                variant="soft"
                                                sx={{
                                                    p: 1.25,
                                                    display: "grid",
                                                    gap: 0.75,
                                                    transition: "transform 120ms ease, box-shadow 120ms ease",
                                                    "&:hover": { transform: "translateY(-1px)", boxShadow: "md" },
                                                }}
                                            >
                                                {/* Title row (stable widths) */}
                                                <Box
                                                    sx={{
                                                        display: "grid",
                                                        gridTemplateColumns: { xs: "84px 1fr", sm: "84px 1fr 200px" },
                                                        alignItems: "center",
                                                        gap: 1,
                                                    }}
                                                >
                                                    <Typography level="title-sm" sx={{ width: 84 }}>
                                                        Title
                                                    </Typography>

                                                    <Input
                                                        value={d.title}
                                                        onChange={(e) => setDraft(id, { title: e.target.value })}
                                                        size="sm"
                                                        sx={{ minWidth: 220 }}
                                                    />

                                                    <Box
                                                        sx={{
                                                            display: { xs: "none", sm: "flex" },
                                                            justifyContent: "flex-end",
                                                            gap: 1,
                                                            width: "100%",
                                                            alignItems: "center",
                                                        }}
                                                    >
                                                        {isNew && (
                                                            <Chip size="sm" variant="soft" color="primary">
                                                                New
                                                            </Chip>
                                                        )}
                                                        <Button
                                                            size="sm"
                                                            variant="outlined"
                                                            onClick={() => jumpTo(d.seconds)}
                                                        >
                                                            Jump
                                                        </Button>
                                                        <Chip
                                                            size="sm"
                                                            variant="soft"
                                                            color="warning"
                                                            sx={{ visibility: dirty ? "visible" : "hidden" }}
                                                        >
                                                            Unsaved
                                                        </Chip>
                                                    </Box>
                                                </Box>

                                                {/* Seconds (clock icon before each) */}
                                                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                                                    <Typography level="title-sm" sx={{ minWidth: 84 }}>
                                                        Start / End
                                                    </Typography>

                                                    {/* Start icon */}
                                                    <Tooltip title="Set start = current video time" variant="soft">
                                                        <span>
                                                            <IconButton
                                                                size="sm"
                                                                variant="soft"
                                                                disabled={!canReadPlayerTime}
                                                                onClick={() => {
                                                                    const t = currentPlayerSecond();
                                                                    setDraft(id, { seconds: t });
                                                                }}
                                                                aria-label="Set start to now"
                                                            >
                                                                <AccessTimeIcon fontSize="small" />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                    <TimeInput
                                                        value={d.seconds}
                                                        onChange={(seconds) => setDraft(id, { seconds })}
                                                        size="sm"
                                                        sx={{ width: 140 }}
                                                        placeholder="0:00"
                                                    />

                                                    {/* End icon */}
                                                    <Tooltip title="Set end = current video time" variant="soft">
                                                        <span>
                                                            <IconButton
                                                                size="sm"
                                                                variant="soft"
                                                                disabled={!canReadPlayerTime}
                                                                onClick={() => {
                                                                    const t = currentPlayerSecond();
                                                                    setDraft(id, { end_seconds: t });
                                                                }}
                                                                aria-label="Set end to now"
                                                            >
                                                                <AccessTimeIcon fontSize="small" />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                    <TimeInput
                                                        value={d.end_seconds ?? 0}
                                                        onChange={(seconds) => setDraft(id, { end_seconds: seconds === 0 ? null : seconds })}
                                                        size="sm"
                                                        sx={{ width: 140 }}
                                                        placeholder="0:00"
                                                    />
                                                </Box>

                                                {/* Primary tag */}
                                                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                                                    <Typography level="title-sm" sx={{ minWidth: 84 }}>
                                                        Primary
                                                    </Typography>
                                                    <Autocomplete
                                                        size="sm"
                                                        options={tagOptions}
                                                        value={
                                                            d.primary_tag_id
                                                                ? tagOptions.find((t) => t.id === d.primary_tag_id) || null
                                                                : null
                                                        }
                                                        onChange={(_e, val) => setDraft(id, { primary_tag_id: val?.id ?? null })}
                                                        getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
                                                        isOptionEqualToValue={(a, b) => a?.id === b?.id}
                                                        sx={{ minWidth: 240, flex: 1, maxWidth: 480 }}
                                                        placeholder="Select primary tag…"
                                                    />
                                                </Box>

                                                {/* Other tags */}
                                                <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
                                                    <Typography level="title-sm" sx={{ minWidth: 84, mt: 0.6 }}>
                                                        Other tags
                                                    </Typography>
                                                    <Autocomplete
                                                        multiple
                                                        size="sm"
                                                        options={tagOptions.filter((t) => t.id !== d.primary_tag_id)}
                                                        value={
                                                            otherTagIds
                                                                .map((tid) => tagOptions.find((t) => t.id === tid))
                                                                .filter(Boolean) as Tag[]
                                                        }
                                                        onChange={(_e, vals) =>
                                                            setDraft(id, {
                                                                tag_ids: Array.from(
                                                                    new Set([
                                                                        ...(d.primary_tag_id ? [d.primary_tag_id] : []),
                                                                        ...vals.map((v) => v.id),
                                                                    ])
                                                                ),
                                                            })
                                                        }
                                                        getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
                                                        isOptionEqualToValue={(a, b) => a?.id === b?.id}
                                                        sx={{ minWidth: 320, flex: 1, maxWidth: 600 }}
                                                        placeholder="Add tags…"
                                                    />
                                                </Box>

                                                {/* Per-row actions */}
                                                <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end", mt: 0.5 }}>
                                                    <Tooltip title="Delete marker" variant="soft">
                                                        <IconButton
                                                            size="sm"
                                                            variant="soft"
                                                            color="danger"
                                                            disabled={savingThis || savingAll}
                                                            onClick={() => handleDeleteRow(id)}
                                                            aria-label="Delete marker"
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Button
                                                        size="sm"
                                                        variant="plain"
                                                        disabled={savingThis || savingAll}
                                                        onClick={() => handleResetRow(id)}
                                                    >
                                                        {isNew ? "Discard" : "Reset"}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        disabled={!dirty || savingThis || savingAll}
                                                        onClick={() => handleSaveRow(id)}
                                                    >
                                                        {savingThis ? "Saving…" : isNew ? "Create" : "Save"}
                                                    </Button>
                                                </Box>
                                            </Card>
                                        );
                                    })
                                )}
                            </Box>

                            {/* Common Tags (bulk add/remove) */}
                            <Box
                                sx={{
                                    borderTop: "1px solid",
                                    borderColor: "divider",
                                    pt: 1.5,
                                    mt: 2,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                }}
                            >
                                <Typography level="title-md">Common Tags</Typography>

                                <Autocomplete
                                    multiple
                                    size="sm"
                                    options={tagOptions}
                                    value={commonTagIds
                                        .map((id) => tagOptions.find((t) => t.id === id))
                                        .filter(Boolean) as Tag[]}
                                    onChange={(_e, vals) =>
                                        setCommonTagIds(Array.from(new Set(vals.map((v) => v.id))))
                                    }
                                    getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
                                    isOptionEqualToValue={(a, b) => a?.id === b?.id}
                                    sx={{ minWidth: 320, maxWidth: 720 }}
                                    placeholder="Pick tags to add/remove on every marker…"
                                />

                                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                                    <Checkbox
                                        size="sm"
                                        label="Remove instead of add"
                                        checked={removeCommonMode}
                                        onChange={(e) => setRemoveCommonMode(e.target.checked)}
                                    />
                                    <Box sx={{ flexGrow: 1 }} />
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        disabled={commonTagIds.length === 0 || savingAll}
                                        onClick={() => setCommonTagIds([])}
                                    >
                                        Clear
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outlined"
                                        disabled={commonTagIds.length === 0 || savingAll}
                                        onClick={handleApplyCommonToAll}
                                    >
                                        Apply to all (drafts)
                                    </Button>
                                </Box>

                                <Typography level="body-xs" sx={{ opacity: 0.8 }}>
                                    {removeCommonMode
                                        ? "Removes these tags from each marker’s draft. Primary tag (if set) is preserved when saving."
                                        : "Adds these tags to each marker’s draft (keeps existing tags and primary)."}
                                </Typography>
                            </Box>
                        </Card>
                    </Grid>

                    {/* RIGHT: VideoJS player (50%) */}
                    <Grid xs={12} md={6} sx={{ display: "flex" }}>
                        <Sheet
                            variant="plain"
                            sx={{
                                p: 0,
                                borderRadius: 0,
                                bgcolor: "transparent",
                                width: "100%",
                                mx: "auto",
                            }}
                        >
                            <Box
                                sx={{
                                    width: "100%",
                                    "& .video-js": {
                                        width: "100%",
                                        height: "auto",
                                        borderRadius: 0,
                                        overflow: "visible",
                                    },
                                    "& .vjs-control-bar": { bottom: 0 },
                                }}
                            >
                                {/* Only render VideoJS when we have scene data and settings */}
                                {scene && stashServer && stashAPI ? (
                                    <VideoJS
                                        options={videoJsOptions}
                                        onReady={handlePlayerReady}
                                        hasStarted={hasStarted}
                                        onEnded={() => setHasStarted(true)}
                                        vttPath={scene?.paths?.vtt}
                                        stashServer={stashServer}
                                        stashAPI={stashAPI}
                                    />
                                ) : (
                                    <Box
                                        sx={{
                                            width: "100%",
                                            aspectRatio: "16/9",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            bgcolor: "neutral.100",
                                            borderRadius: "md"
                                        }}
                                    >
                                        <Typography level="body-sm">Loading video player...</Typography>
                                    </Box>
                                )}
                            </Box>
                        </Sheet>
                    </Grid>
                </Grid>
            </Sheet>

            {/* Delete Confirmation Dialog */}
            <Modal open={deleteDialogOpen} onClose={cancelDelete}>
                <ModalDialog sx={{ minWidth: 360 }}>
                    <DialogTitle>Delete Marker</DialogTitle>
                    <DialogContent>
                        <Typography level="body-sm">
                            Are you sure you want to delete "{markerToDelete?.title}"?
                        </Typography>
                        <Typography level="body-xs" sx={{ mt: 1, opacity: 0.8 }}>
                            This action cannot be undone.
                        </Typography>
                    </DialogContent>
                    <DialogActions>
                        <Button variant="plain" onClick={cancelDelete}>
                            Cancel
                        </Button>
                        <Button color="danger" onClick={confirmDelete}>
                            Delete
                        </Button>
                    </DialogActions>
                </ModalDialog>
            </Modal>
        </Container>
    );
}
