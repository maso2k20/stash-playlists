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
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useSceneMarkers } from "@/hooks/useSceneMarkers";
import { useStashTags } from "@/context/StashTagsContext";
import { useSettings } from "@/app/context/SettingsContext";
import VideoJS from "@/components/videojs/VideoJS";
import { TimelineEditor } from "@/components/timeline";
import { MarkerDetailPanel } from "@/components/timeline/MarkerDetailPanel";
import { BulkTagsPanel } from "@/components/timeline/BulkTagsPanel";
import type { Tag, MarkerForTimeline, Draft, SelectionRect } from "@/types/markers";

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
        handleDeleteMultiple,
        handleSaveAll,
        addMarkersOrganisedTag,
        isDirtyExisting,
        isTemp,
    } = useSceneMarkers(sceneId, tagOptions);

    // Local state - multi-select support
    const [selectedMarkerIds, setSelectedMarkerIds] = useState<Set<string>>(new Set());
    // Derived single selection for detail panel (last selected, or null if multiple)
    const selectedMarkerId = selectedMarkerIds.size === 1 ? Array.from(selectedMarkerIds)[0] : null;
    const [currentTime, setCurrentTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    const [playerReady, setPlayerReady] = useState(false);
    const playerRef = useRef<any>(null);

    // Ratings state - keyed by marker ID
    const [ratings, setRatings] = useState<Record<string, number | null>>({});

    // Delete confirmation dialog
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const deleteButtonRef = useRef<HTMLButtonElement>(null);

    // Bulk delete confirmation dialog
    const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
    const bulkDeleteButtonRef = useRef<HTMLButtonElement>(null);

    // Bulk merge confirmation dialog
    const [bulkMergeDialogOpen, setBulkMergeDialogOpen] = useState(false);
    const [merging, setMerging] = useState(false);

    // Pause video and focus delete button when dialog opens
    useEffect(() => {
        if (deleteDialogOpen) {
            // Pause the video to release focus
            if (playerRef.current && !playerRef.current.paused()) {
                playerRef.current.pause();
            }
            // Focus the delete button after a short delay to ensure dialog is rendered
            const timer = setTimeout(() => {
                deleteButtonRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [deleteDialogOpen]);

    // Focus bulk delete button when bulk dialog opens
    useEffect(() => {
        if (bulkDeleteDialogOpen) {
            if (playerRef.current && !playerRef.current.paused()) {
                playerRef.current.pause();
            }
            const timer = setTimeout(() => {
                bulkDeleteButtonRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [bulkDeleteDialogOpen]);

    // Snackbar for notifications
    const [snack, setSnack] = useState<{ open: boolean; msg: string; color?: "success" | "neutral" }>({
        open: false,
        msg: "",
        color: "neutral",
    });

    // Time clipboard for copy/paste between markers
    const [timeClipboard, setTimeClipboard] = useState<number | null>(null);

    // Fetch ratings for existing markers
    useEffect(() => {
        const existingIds = markers.map(m => m.id);
        if (existingIds.length === 0) return;

        const fetchRatings = async () => {
            try {
                const res = await fetch(`/api/items/ratings?ids=${existingIds.join(',')}`);
                const data = await res.json();
                if (data.success && data.ratings) {
                    setRatings(data.ratings);
                }
            } catch (error) {
                console.error('Failed to fetch ratings:', error);
            }
        };

        fetchRatings();
    }, [markers]);

    // Handle rating change for a marker
    const handleRatingChangeInternal = useCallback(async (markerId: string, newRating: number | null) => {
        // Update local state immediately
        setRatings(prev => ({ ...prev, [markerId]: newRating }));

        try {
            // Check if item exists
            const checkRes = await fetch(`/api/items/${markerId}/rating`);

            if (checkRes.status === 404) {
                // Item doesn't exist - create it first
                const marker = markers.find(m => m.id === markerId);
                if (!marker) return;

                await fetch('/api/items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: markerId,
                        title: marker.title || '',
                        startTime: marker.seconds,
                        endTime: marker.end_seconds,
                        rating: newRating,
                        sceneId: sceneId,
                    }),
                });
            } else {
                // Item exists - update rating
                await fetch(`/api/items/${markerId}/rating`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rating: newRating }),
                });
            }
        } catch (error) {
            console.error('Failed to update rating:', error);
            // Revert on error
            setRatings(prev => {
                const revert = { ...prev };
                delete revert[markerId];
                return revert;
            });
        }
    }, [markers, sceneId]);

    // Memoized rating change handler for the selected marker
    const handleSelectedRatingChange = useCallback((newRating: number | null) => {
        if (selectedMarkerId && !isTemp(selectedMarkerId)) {
            handleRatingChangeInternal(selectedMarkerId, newRating);
        }
    }, [selectedMarkerId, handleRatingChangeInternal, isTemp]);

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
            // Default to start + 10 seconds if no end time set
            const effectiveEndSeconds = draft?.end_seconds ?? marker.end_seconds ?? (effectiveSeconds + 10);

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
                isActive: selectedMarkerIds.has(marker.id),
            });
        }

        // Add new (temp) markers
        for (const id of newIds) {
            const draft = drafts[id];
            if (!draft) continue;
            // Default to start + 10 seconds if no end time set
            const effectiveEndSeconds = draft.end_seconds ?? (draft.seconds + 10);

            result.push({
                id,
                start: draft.seconds,
                end: effectiveEndSeconds,
                title: draft.title,
                primaryTagName: draft.primary_tag_id
                    ? tagOptions.find((t) => t.id === draft.primary_tag_id)?.name
                    : undefined,
                isDirty: true,
                isNew: true,
                isActive: selectedMarkerIds.has(id),
            });
        }

        return result;
    }, [markers, drafts, newIds, tagOptions, selectedMarkerIds, isDirtyExisting]);

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
    const handleMarkerSelect = useCallback((id: string, addToSelection?: boolean) => {
        if (!id) {
            // Clicking empty space clears selection
            setSelectedMarkerIds(new Set());
            return;
        }

        if (addToSelection) {
            // Ctrl/Cmd+click: toggle marker in/out of selection
            setSelectedMarkerIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) {
                    next.delete(id);
                } else {
                    next.add(id);
                }
                return next;
            });
        } else {
            // Regular click: replace selection with single marker
            setSelectedMarkerIds(new Set([id]));
        }
    }, []);

    const handleMarkerDoubleClick = useCallback((id: string) => {
        // Double click: select AND seek to marker start
        setSelectedMarkerIds(id ? new Set([id]) : new Set());

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
        setSelectedMarkerIds(new Set([newId]));
    }, [addNewMarker, currentTime]);

    // Handle drag-selection setting multiple markers at once
    const handleSetSelection = useCallback((ids: string[]) => {
        setSelectedMarkerIds(new Set(ids));
    }, []);

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
            setSelectedMarkerIds(new Set());
        }
        setDeleteDialogOpen(false);
        setPendingDeleteId(null);
    }, [pendingDeleteId, handleDeleteRow]);

    const cancelDelete = useCallback(() => {
        setDeleteDialogOpen(false);
        setPendingDeleteId(null);
    }, []);

    // Bulk delete handlers
    const confirmBulkDelete = useCallback(async () => {
        const ids = Array.from(selectedMarkerIds);
        await handleDeleteMultiple(ids);
        setSelectedMarkerIds(new Set());
        setBulkDeleteDialogOpen(false);
    }, [selectedMarkerIds, handleDeleteMultiple]);

    const cancelBulkDelete = useCallback(() => {
        setBulkDeleteDialogOpen(false);
    }, []);

    // Bulk merge handlers
    const confirmBulkMerge = useCallback(async () => {
        setMerging(true);
        try {
            const ids = Array.from(selectedMarkerIds);

            // Get marker data (combining originals with drafts)
            const selectedMarkers = ids.map(id => {
                const original = markers.find(m => m.id === id);
                const draft = drafts[id];
                if (!original && !draft) return null;
                return {
                    id,
                    seconds: draft?.seconds ?? original?.seconds ?? 0,
                    end_seconds: draft?.end_seconds ?? original?.end_seconds ?? null,
                    title: draft?.title ?? original?.title ?? '',
                    primary_tag_id: draft?.primary_tag_id ?? original?.primary_tag?.id ?? null,
                    tag_ids: draft?.tag_ids ?? original?.tags?.map(t => t.id) ?? [],
                };
            }).filter(Boolean) as Array<{
                id: string;
                seconds: number;
                end_seconds: number | null;
                title: string;
                primary_tag_id: string | null;
                tag_ids: string[];
            }>;

            if (selectedMarkers.length < 2) {
                setBulkMergeDialogOpen(false);
                return;
            }

            // Sort by start time
            selectedMarkers.sort((a, b) => a.seconds - b.seconds);

            const firstMarker = selectedMarkers[0];

            // Calculate max end time
            const maxEndTime = Math.max(
                ...selectedMarkers.map(m => m.end_seconds ?? m.seconds)
            );

            // Combine all unique tags
            const allTagIds = new Set<string>();
            selectedMarkers.forEach(m => {
                m.tag_ids.forEach(id => allTagIds.add(id));
            });

            // Update first marker's draft with merged values
            setDraft(firstMarker.id, {
                title: firstMarker.title,
                seconds: firstMarker.seconds,
                end_seconds: maxEndTime,
                primary_tag_id: firstMarker.primary_tag_id,
                tag_ids: Array.from(allTagIds),
            });

            // Save the first marker
            await handleSaveRow(firstMarker.id);

            // Delete remaining markers
            const idsToDelete = ids.filter(id => id !== firstMarker.id);
            if (idsToDelete.length > 0) {
                await handleDeleteMultiple(idsToDelete);
            }

            setSelectedMarkerIds(new Set());
            setBulkMergeDialogOpen(false);
        } finally {
            setMerging(false);
        }
    }, [selectedMarkerIds, markers, drafts, setDraft, handleSaveRow, handleDeleteMultiple]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't handle shortcuts when typing in input fields
            const target = e.target as HTMLElement;
            if (
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.isContentEditable ||
                target.role === "combobox" ||
                target.role === "listbox" ||
                target.role === "textbox" ||
                target.closest('[role="combobox"]') ||
                target.closest('[role="listbox"]') ||
                target.closest('.MuiAutocomplete-root')
            ) {
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
                    if (selectedMarkerIds.size > 0 && !deleteDialogOpen && !bulkDeleteDialogOpen) {
                        e.preventDefault();
                        if (selectedMarkerIds.size === 1) {
                            // Single selection - use existing single delete dialog
                            setPendingDeleteId(Array.from(selectedMarkerIds)[0]);
                            setDeleteDialogOpen(true);
                        } else {
                            // Multiple selection - use bulk delete dialog
                            setBulkDeleteDialogOpen(true);
                        }
                    }
                    break;
                case "m":
                case "M":
                    if (selectedMarkerIds.size > 1 && !bulkMergeDialogOpen && !bulkDeleteDialogOpen) {
                        e.preventDefault();
                        setBulkMergeDialogOpen(true);
                    }
                    break;
                case "Escape":
                    e.preventDefault();
                    setSelectedMarkerIds(new Set());
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
    }, [playerReady, currentTime, duration, selectedMarkerIds, deleteDialogOpen, bulkDeleteDialogOpen, bulkMergeDialogOpen]);

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

                <Button
                    size="sm"
                    variant="soft"
                    color="success"
                    startDecorator={<CheckCircleOutlineIcon />}
                    onClick={async () => {
                        await addMarkersOrganisedTag();
                        setSnack({ open: true, msg: "Marked as organised", color: "success" });
                    }}
                >
                    Mark Organised
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
                            rating={selectedMarkerId ? ratings[selectedMarkerId] : null}
                            onRatingChange={selectedMarkerId && !isSelectedNew ? handleSelectedRatingChange : undefined}
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
                    selectedCount={selectedMarkerIds.size}
                    onMarkerSelect={handleMarkerSelect}
                    onSetSelection={handleSetSelection}
                    onMarkerDoubleClick={handleMarkerDoubleClick}
                    onMarkerDragEnd={handleMarkerDragEnd}
                    onSeek={handleSeek}
                    onAddMarker={handleAddMarker}
                    onDeleteSelected={() => setBulkDeleteDialogOpen(true)}
                    onMergeSelected={() => setBulkMergeDialogOpen(true)}
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
                        <Button ref={deleteButtonRef} variant="solid" color="danger" onClick={confirmDelete} autoFocus>
                            Delete
                        </Button>
                    </DialogActions>
                </ModalDialog>
            </Modal>

            {/* Bulk Delete Confirmation Dialog */}
            <Modal open={bulkDeleteDialogOpen} onClose={cancelBulkDelete}>
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
                    <DialogTitle>Delete {selectedMarkerIds.size} Markers</DialogTitle>
                    <DialogContent>
                        <Typography level="body-sm">
                            Are you sure you want to delete {selectedMarkerIds.size} markers? This action cannot be undone.
                        </Typography>
                    </DialogContent>
                    <DialogActions>
                        <Button variant="plain" color="neutral" onClick={cancelBulkDelete}>
                            Cancel
                        </Button>
                        <Button ref={bulkDeleteButtonRef} variant="solid" color="danger" onClick={confirmBulkDelete} autoFocus>
                            Delete All
                        </Button>
                    </DialogActions>
                </ModalDialog>
            </Modal>

            {/* Bulk Merge Confirmation Dialog */}
            <Modal open={bulkMergeDialogOpen} onClose={() => !merging && setBulkMergeDialogOpen(false)}>
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
                    <DialogTitle>{merging ? "Merging Markers..." : `Merge ${selectedMarkerIds.size} Markers`}</DialogTitle>
                    <DialogContent>
                        <Typography level="body-sm">
                            {merging
                                ? "Please wait while the markers are being merged."
                                : `Combine ${selectedMarkerIds.size} markers into one? The merged marker will span from the earliest start to the latest end time.`
                            }
                        </Typography>
                    </DialogContent>
                    {!merging && (
                        <DialogActions>
                            <Button variant="plain" color="neutral" onClick={() => setBulkMergeDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button variant="solid" color="primary" onClick={confirmBulkMerge} autoFocus>
                                Merge All
                            </Button>
                        </DialogActions>
                    )}
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
