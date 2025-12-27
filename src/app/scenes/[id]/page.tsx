"use client";

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    Box,
    Typography,
    Button,
    IconButton,
    Chip,
    Skeleton,
    Tooltip,
    Container,
    Modal,
    ModalDialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Snackbar,
} from "@mui/joy";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import ViewListIcon from "@mui/icons-material/ViewList";
import { useSceneMarkers } from "@/hooks/useSceneMarkers";
import { useStashTags } from "@/context/StashTagsContext";
import { useSettings } from "@/app/context/SettingsContext";
import VideoJS from "@/components/videojs/VideoJS";
import { TimelineEditor } from "@/components/timeline";
import { MarkerDetailPanel } from "@/components/timeline/MarkerDetailPanel";
import { BulkTagsPanel } from "@/components/timeline/BulkTagsPanel";
import type { Tag, MarkerForTimeline, Draft } from "@/types/markers";

export default function TimelineEditorPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const sceneId = params.id;

    // Settings
    const settings = useSettings();
    const stashServer = String(settings["STASH_SERVER"] || "").replace(/\/+$/, "");
    const stashAPI = String(settings["STASH_API"] || "");

    // Tags from context
    const { stashTags, refetch: refetchTags } = useStashTags();
    const tagOptions: Tag[] = useMemo(
        () =>
            (stashTags || []).map((t: any) => ({
                id: String(t.id),
                name: String(t.name),
                children: (t.children || []).map((c: any) => ({
                    id: String(c.id),
                    name: String(c.name),
                })),
            })),
        [stashTags]
    );

    // Performer count recommendations
    const [performerCountRecommendations, setPerformerCountRecommendations] = useState<Record<number, string>>({});

    // Load performer count recommendations
    useEffect(() => {
        const loadRecommendations = async () => {
            try {
                const response = await fetch('/api/settings/performer-count-recommendations');
                const result = await response.json();
                if (result.success) {
                    setPerformerCountRecommendations(result.recommendations);
                }
            } catch (error) {
                console.error('Failed to load performer count recommendations:', error);
            }
        };
        loadRecommendations();
    }, []);

    // Scene markers hook
    const {
        scene,
        markers,
        drafts,
        newIds,
        loading,
        savingId,
        savingAll,
        dirtyCount,
        setDraft,
        addNewMarker,
        handleSaveRow,
        handleResetRow,
        handleDeleteRow,
        handleSaveAll,
        isDirtyExisting,
        isTemp,
    } = useSceneMarkers(sceneId, tagOptions);

    // Local state
    const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    const [playerReady, setPlayerReady] = useState(false);
    const playerRef = useRef<any>(null);

    // Delete confirmation dialog
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    // Snackbar for notifications
    const [snack, setSnack] = useState<{ open: boolean; msg: string; color?: "success" | "neutral" }>({
        open: false,
        msg: "",
        color: "neutral",
    });

    // Time clipboard for copy/paste between markers
    const [timeClipboard, setTimeClipboard] = useState<number | null>(null);

    // Handle back navigation - trigger marker generate task
    const handleGoBack = useCallback(async () => {
        try {
            // Fire-and-forget: trigger generate task for marker previews
            fetch(`/api/scenes/${sceneId}/generate`, { method: "POST" });
            setSnack({ open: true, msg: "Generating marker previews...", color: "neutral" });
        } catch (error) {
            console.error("Failed to trigger generate task:", error);
        }
        // Navigate back regardless of generate task result
        router.back();
    }, [sceneId, router]);

    // Calculate fallback duration from markers if video hasn't loaded
    const markerMaxTime = useMemo(() => {
        let maxTime = 0;
        for (const marker of markers) {
            const draft = drafts[marker.id];
            const endTime = draft?.end_seconds ?? marker.end_seconds ?? marker.seconds + 30;
            if (endTime > maxTime) maxTime = endTime;
        }
        // Add some padding
        return maxTime > 0 ? maxTime + 30 : 300; // Default to 5 minutes if no markers
    }, [markers, drafts]);

    const duration = videoDuration > 0 ? videoDuration : markerMaxTime;

    // Performer tags - collect and deduplicate all tags from scene performers
    const performerTags: Tag[] = useMemo(() => {
        if (!scene?.performers) return [];
        const allTags = scene.performers.flatMap((p: any) => (p.tags || []) as Tag[]);
        return Array.from(new Map(allTags.map((t: Tag) => [t.id, t])).values()) as Tag[];
    }, [scene?.performers]);

    const performerCount = scene?.performers?.length || 0;

    // Apply common tags to all markers
    const handleApplyCommonTags = useCallback((tagIds: string[], remove: boolean) => {
        const allIds = [...markers.map(m => m.id), ...newIds];
        for (const id of allIds) {
            const currentDraft = drafts[id];
            if (currentDraft) {
                const newTagIds = remove
                    ? currentDraft.tag_ids.filter((tid) => !tagIds.includes(tid))
                    : Array.from(new Set([...currentDraft.tag_ids, ...tagIds]));
                setDraft(id, { tag_ids: newTagIds });
            }
        }
    }, [markers, newIds, drafts, setDraft]);

    // Apply performer tags to all markers
    const handleApplyPerformerTags = useCallback((tagIds: string[], remove: boolean) => {
        const allIds = [...markers.map(m => m.id), ...newIds];
        for (const id of allIds) {
            const currentDraft = drafts[id];
            if (currentDraft) {
                const newTagIds = remove
                    ? currentDraft.tag_ids.filter((tid) => !tagIds.includes(tid))
                    : Array.from(new Set([...currentDraft.tag_ids, ...tagIds]));
                setDraft(id, { tag_ids: newTagIds });
            }
        }
    }, [markers, newIds, drafts, setDraft]);

    // Format markers for timeline
    const markersForTimeline: MarkerForTimeline[] = useMemo(() => {
        const result: MarkerForTimeline[] = [];

        // Add server markers with draft overlays
        for (const marker of markers) {
            const draft = drafts[marker.id];
            const effectiveSeconds = draft?.seconds ?? marker.seconds;
            const effectiveEndSeconds = draft?.end_seconds ?? marker.end_seconds;

            if (effectiveEndSeconds === null) continue;

            const isDirty = draft ? isDirtyExisting(marker, draft) : false;

            result.push({
                id: marker.id,
                start: effectiveSeconds,
                end: effectiveEndSeconds,
                title: draft?.title || marker.title,
                primaryTagName:
                    (draft?.primary_tag_id
                        ? tagOptions.find((t) => t.id === draft.primary_tag_id)?.name
                        : marker.primary_tag?.name) || undefined,
                isDirty,
                isNew: false,
                isActive: marker.id === selectedMarkerId,
            });
        }

        // Add new (temp) markers
        for (const id of newIds) {
            const draft = drafts[id];
            if (!draft || draft.end_seconds === null) continue;

            result.push({
                id,
                start: draft.seconds,
                end: draft.end_seconds,
                title: draft.title,
                primaryTagName: draft.primary_tag_id
                    ? tagOptions.find((t) => t.id === draft.primary_tag_id)?.name
                    : undefined,
                isDirty: true,
                isNew: true,
                isActive: id === selectedMarkerId,
            });
        }

        return result;
    }, [markers, drafts, newIds, tagOptions, selectedMarkerId, isDirtyExisting]);

    // Video stream URL (same format as list view)
    const streamUrl = useMemo(() => {
        return sceneId && stashServer ? `${stashServer}/scene/${sceneId}/stream?api_key=${stashAPI}` : "";
    }, [sceneId, stashServer, stashAPI]);

    // Video options
    const videoJsOptions = useMemo(() => {
        if (!streamUrl) return null;

        return {
            autoplay: false,
            controls: true,
            responsive: true,
            fluid: true,
            muted: true,
            aspectRatio: "16:9",
            sources: [{ src: streamUrl, type: "video/mp4" }],
            playbackRates: [0.5, 1, 1.5, 2],
        };
    }, [streamUrl]);

    // Player handlers
    const handlePlayerReady = useCallback((player: any) => {
        playerRef.current = player;
        player.muted(true);

        player.on("loadedmetadata", () => {
            setVideoDuration(player.duration() || 0);
            setPlayerReady(true);
        });

        player.on("timeupdate", () => {
            setCurrentTime(player.currentTime() || 0);
        });
    }, []);

    const handleSeek = useCallback((time: number) => {
        if (playerRef.current && playerReady) {
            const wasPlaying = !playerRef.current.paused();
            playerRef.current.currentTime(time);
            if (wasPlaying) {
                playerRef.current.play();
            }
        }
    }, [playerReady]);

    // Stable callback for getting current time (avoids re-renders from timeupdate)
    const getCurrentTime = useCallback(() => {
        return playerRef.current?.currentTime() ?? 0;
    }, []);

    // Timeline handlers
    const handleMarkerSelect = useCallback((id: string) => {
        setSelectedMarkerId(id || null);

        // Seek to marker start
        if (id) {
            const draft = drafts[id];
            const marker = markers.find((m) => m.id === id);
            const time = draft?.seconds ?? marker?.seconds ?? 0;
            handleSeek(time);
        }
    }, [drafts, markers, handleSeek]);

    const handleMarkerDragEnd = useCallback(
        (id: string, newStart: number, newEnd: number) => {
            setDraft(id, { seconds: newStart, end_seconds: newEnd });
        },
        [setDraft]
    );

    const handleAddMarker = useCallback(() => {
        // Create new marker at current playhead position
        const newId = addNewMarker({
            seconds: Math.round(currentTime * 10) / 10,
            end_seconds: Math.round((currentTime + 10) * 10) / 10, // Default 10 second duration
        });
        setSelectedMarkerId(newId);
    }, [addNewMarker, currentTime]);

    // Selected marker data
    const selectedDraft = selectedMarkerId ? drafts[selectedMarkerId] : null;
    const selectedMarker = selectedMarkerId
        ? markers.find((m) => m.id === selectedMarkerId)
        : null;
    const isSelectedNew = selectedMarkerId ? isTemp(selectedMarkerId) : false;
    const isSelectedDirty = selectedMarker && selectedDraft
        ? isDirtyExisting(selectedMarker, selectedDraft)
        : isSelectedNew;

    // Panel handlers
    const handleDraftChange = useCallback(
        (patch: Partial<Draft>) => {
            if (selectedMarkerId) {
                setDraft(selectedMarkerId, patch);
            }
        },
        [selectedMarkerId, setDraft]
    );

    const handleSaveSelected = useCallback(() => {
        if (selectedMarkerId) {
            handleSaveRow(selectedMarkerId);
        }
    }, [selectedMarkerId, handleSaveRow]);

    const handleResetSelected = useCallback(() => {
        if (selectedMarkerId) {
            handleResetRow(selectedMarkerId);
        }
    }, [selectedMarkerId, handleResetRow]);

    const handleDeleteSelected = useCallback(() => {
        if (selectedMarkerId) {
            setPendingDeleteId(selectedMarkerId);
            setDeleteDialogOpen(true);
        }
    }, [selectedMarkerId]);

    const confirmDelete = useCallback(() => {
        if (pendingDeleteId) {
            handleDeleteRow(pendingDeleteId);
            setSelectedMarkerId(null);
        }
        setDeleteDialogOpen(false);
        setPendingDeleteId(null);
    }, [pendingDeleteId, handleDeleteRow]);

    const cancelDelete = useCallback(() => {
        setDeleteDialogOpen(false);
        setPendingDeleteId(null);
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't handle shortcuts when typing in input fields
            const target = e.target as HTMLElement;
            if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
                return;
            }

            switch (e.key) {
                case "ArrowLeft":
                    e.preventDefault();
                    if (playerRef.current && playerReady) {
                        const newTime = Math.max(0, currentTime - 5);
                        playerRef.current.currentTime(newTime);
                    }
                    break;
                case "ArrowRight":
                    e.preventDefault();
                    if (playerRef.current && playerReady) {
                        const newTime = Math.min(duration, currentTime + 5);
                        playerRef.current.currentTime(newTime);
                    }
                    break;
                case "Delete":
                case "Backspace":
                    if (selectedMarkerId && !deleteDialogOpen) {
                        e.preventDefault();
                        setPendingDeleteId(selectedMarkerId);
                        setDeleteDialogOpen(true);
                    }
                    break;
                case " ": // Space bar for play/pause
                    e.preventDefault();
                    if (playerRef.current && playerReady) {
                        if (playerRef.current.paused()) {
                            playerRef.current.play();
                        } else {
                            playerRef.current.pause();
                        }
                    }
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [playerReady, currentTime, duration, selectedMarkerId, deleteDialogOpen]);

    // Loading state
    if (loading && !scene) {
        return (
            <Container maxWidth="xl" sx={{ py: 2 }}>
                <Skeleton variant="rectangular" height={400} />
            </Container>
        );
    }

    return (
        <Box sx={{ height: "calc(100vh - 70px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Header */}
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    px: 2,
                    py: 1.5,
                    flexWrap: "wrap",
                    flexShrink: 0,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                }}
            >
                <Tooltip title="Go back">
                    <IconButton
                        variant="soft"
                        onClick={handleGoBack}
                    >
                        <ArrowBackIcon />
                    </IconButton>
                </Tooltip>

                <Button
                    size="sm"
                    variant="solid"
                    color="primary"
                    startDecorator={<SaveIcon />}
                    onClick={handleSaveAll}
                    loading={savingAll}
                    disabled={dirtyCount === 0}
                >
                    Save All {dirtyCount > 0 && `(${dirtyCount})`}
                </Button>

                {/* Performers */}
                {scene?.performers && scene.performers.length > 0 && (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {scene.performers.map((performer: any) => (
                            <Chip
                                key={performer.id}
                                size="sm"
                                variant="outlined"
                                color="primary"
                                sx={{
                                    fontWeight: 500,
                                    borderStyle: "solid",
                                    borderWidth: 1.5
                                }}
                            >
                                {performer.name}
                            </Chip>
                        ))}
                    </Box>
                )}

                <Typography level="h4" sx={{ flex: 1 }}>
                    {scene?.title || "Loading..."}
                </Typography>

                {dirtyCount > 0 && (
                    <Chip size="sm" color="warning" variant="soft">
                        {dirtyCount} unsaved
                    </Chip>
                )}

                <Button
                    size="sm"
                    variant="outlined"
                    color="neutral"
                    onClick={() => refetchTags()}
                >
                    Refresh Tags
                </Button>

                <Tooltip title="Switch to list view">
                    <Button
                        size="sm"
                        variant="soft"
                        startDecorator={<ViewListIcon />}
                        onClick={() => router.push(`/scenes/${sceneId}/list`)}
                    >
                        List View
                    </Button>
                </Tooltip>
            </Box>

            {/* Top section - Marker panel + Video side by side */}
            <Box sx={{ display: "flex", gap: 2, px: 2, pt: 2, flex: 1, overflow: "hidden" }}>
                {/* Left panel - Marker details + Bulk tags */}
                <Box sx={{ width: 350, flexShrink: 0, height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 1.5 }}>
                    <Box sx={{ flex: 1, minHeight: 0 }}>
                        <MarkerDetailPanel
                            selectedMarkerId={selectedMarkerId}
                            draft={selectedDraft}
                            tagOptions={tagOptions}
                            isNew={isSelectedNew}
                            isDirty={isSelectedDirty || false}
                            isSaving={savingId === selectedMarkerId}
                            getCurrentTime={getCurrentTime}
                            playerReady={playerReady}
                            timeClipboard={timeClipboard}
                            onTimeClipboardChange={setTimeClipboard}
                            onDraftChange={handleDraftChange}
                            onSave={handleSaveSelected}
                            onReset={handleResetSelected}
                            onDelete={handleDeleteSelected}
                        />
                    </Box>
                    <BulkTagsPanel
                        tagOptions={tagOptions}
                        performerTags={performerTags}
                        performerCount={performerCount}
                        performerCountRecommendations={performerCountRecommendations}
                        savingAll={savingAll}
                        onApplyCommonTags={handleApplyCommonTags}
                        onApplyPerformerTags={handleApplyPerformerTags}
                    />
                </Box>

                {/* Right panel - Video player (compact) */}
                <Box
                    sx={{
                        flex: 1,
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "black",
                        borderRadius: "lg",
                        overflow: "hidden",
                    }}
                >
                    {videoJsOptions && (
                        <Box
                            sx={{
                                height: "100%",
                                aspectRatio: "16/9",
                                "& .video-js": {
                                    width: "100%",
                                    height: "100%",
                                },
                            }}
                        >
                            <VideoJS
                                options={videoJsOptions}
                                onReady={handlePlayerReady}
                            />
                        </Box>
                    )}
                </Box>
            </Box>

            {/* Timeline - Full width, fixed height */}
            <Box sx={{ height: 180, px: 2, pb: 1, flexShrink: 0 }}>
                <TimelineEditor
                    markers={markersForTimeline}
                    duration={duration}
                    currentTime={currentTime}
                    selectedMarkerId={selectedMarkerId}
                    onMarkerSelect={handleMarkerSelect}
                    onMarkerDragEnd={handleMarkerDragEnd}
                    onSeek={handleSeek}
                    onAddMarker={handleAddMarker}
                />
            </Box>

            {/* Delete Confirmation Dialog - positioned lower for timeline use */}
            <Modal open={deleteDialogOpen} onClose={cancelDelete}>
                <ModalDialog
                    sx={{
                        position: "fixed",
                        top: "auto",
                        bottom: "25%",
                        left: "50%",
                        transform: "translateX(-50%)",
                        minWidth: 300,
                    }}
                >
                    <DialogTitle>Delete Marker</DialogTitle>
                    <DialogContent>
                        <Typography level="body-sm">
                            Are you sure you want to delete this marker?
                        </Typography>
                    </DialogContent>
                    <DialogActions>
                        <Button variant="plain" color="neutral" onClick={cancelDelete}>
                            Cancel
                        </Button>
                        <Button variant="solid" color="danger" onClick={confirmDelete} autoFocus>
                            Delete
                        </Button>
                    </DialogActions>
                </ModalDialog>
            </Modal>

            {/* Snackbar for notifications */}
            <Snackbar
                open={snack.open}
                onClose={() => setSnack((s) => ({ ...s, open: false }))}
                color={snack.color ?? "neutral"}
                variant="soft"
                autoHideDuration={3000}
            >
                {snack.msg}
            </Snackbar>
        </Box>
    );
}
