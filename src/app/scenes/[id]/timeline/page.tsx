"use client";

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    Container,
    Box,
    Typography,
    Button,
    IconButton,
    Chip,
    Skeleton,
    Tooltip,
} from "@mui/joy";
import Grid from "@mui/joy/Grid";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import ViewListIcon from "@mui/icons-material/ViewList";
import { useSceneMarkers } from "@/hooks/useSceneMarkers";
import { useStashTags } from "@/context/StashTagsContext";
import { useSettings } from "@/app/context/SettingsContext";
import VideoJS from "@/components/videojs/VideoJS";
import { TimelineEditor } from "@/components/timeline";
import { MarkerDetailPanel } from "@/components/timeline/MarkerDetailPanel";
import { makeStashUrl } from "@/lib/urlUtils";
import type { Tag, MarkerForTimeline, Draft } from "@/types/markers";

export default function TimelineEditorPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const sceneId = params.id;

    // Settings
    const { settings } = useSettings();
    const stashServerUrl = settings?.STASH_SERVER || "";

    // Tags from context
    const { stashTags } = useStashTags();
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
    const [duration, setDuration] = useState(0);
    const [playerReady, setPlayerReady] = useState(false);
    const playerRef = useRef<any>(null);

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

    // Video options
    const videoJsOptions = useMemo(() => {
        if (!scene?.paths?.stream) return null;

        return {
            autoplay: false,
            controls: true,
            responsive: true,
            fluid: true,
            muted: true,
            sources: [
                {
                    src: makeStashUrl(stashServerUrl, scene.paths.stream),
                    type: "video/mp4",
                },
            ],
            playbackRates: [0.5, 1, 1.5, 2],
        };
    }, [scene?.paths?.stream, stashServerUrl]);

    // Player handlers
    const handlePlayerReady = useCallback((player: any) => {
        playerRef.current = player;
        player.muted(true);

        player.on("loadedmetadata", () => {
            setDuration(player.duration() || 0);
            setPlayerReady(true);
        });

        player.on("timeupdate", () => {
            setCurrentTime(player.currentTime() || 0);
        });
    }, []);

    const handleSeek = useCallback((time: number) => {
        if (playerRef.current && playerReady) {
            playerRef.current.currentTime(time);
            playerRef.current.play();
        }
    }, [playerReady]);

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
            const confirmDelete = window.confirm("Are you sure you want to delete this marker?");
            if (confirmDelete) {
                handleDeleteRow(selectedMarkerId);
                setSelectedMarkerId(null);
            }
        }
    }, [selectedMarkerId, handleDeleteRow]);

    // Loading state
    if (loading && !scene) {
        return (
            <Container maxWidth="xl" sx={{ py: 2 }}>
                <Skeleton variant="rectangular" height={400} />
            </Container>
        );
    }

    return (
        <Container maxWidth={false} sx={{ py: 2, px: 2, height: "100vh", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    mb: 2,
                    flexWrap: "wrap",
                }}
            >
                <Tooltip title="Back to scenes">
                    <IconButton
                        variant="soft"
                        onClick={() => router.push("/scenes")}
                    >
                        <ArrowBackIcon />
                    </IconButton>
                </Tooltip>

                <Typography level="h4" sx={{ flex: 1 }}>
                    {scene?.title || "Loading..."}
                </Typography>

                {dirtyCount > 0 && (
                    <Chip size="sm" color="warning" variant="soft">
                        {dirtyCount} unsaved
                    </Chip>
                )}

                <Tooltip title="Switch to list view">
                    <Button
                        size="sm"
                        variant="soft"
                        startDecorator={<ViewListIcon />}
                        onClick={() => router.push(`/scenes/${sceneId}`)}
                    >
                        List View
                    </Button>
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
                    Save All
                </Button>
            </Box>

            {/* Main content */}
            <Grid container spacing={2} sx={{ flex: 1, minHeight: 0 }}>
                {/* Left panel - Marker details */}
                <Grid xs={12} md={3}>
                    <MarkerDetailPanel
                        selectedMarkerId={selectedMarkerId}
                        draft={selectedDraft}
                        tagOptions={tagOptions}
                        isNew={isSelectedNew}
                        isDirty={isSelectedDirty || false}
                        isSaving={savingId === selectedMarkerId}
                        onDraftChange={handleDraftChange}
                        onSave={handleSaveSelected}
                        onReset={handleResetSelected}
                        onDelete={handleDeleteSelected}
                    />
                </Grid>

                {/* Right panel - Video player */}
                <Grid xs={12} md={9}>
                    <Box
                        sx={{
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                        }}
                    >
                        {/* Video player */}
                        <Box
                            sx={{
                                flex: 1,
                                minHeight: 200,
                                maxHeight: "50vh",
                                backgroundColor: "black",
                                borderRadius: "lg",
                                overflow: "hidden",
                            }}
                        >
                            {videoJsOptions && (
                                <VideoJS
                                    options={videoJsOptions}
                                    onReady={handlePlayerReady}
                                />
                            )}
                        </Box>

                        {/* Timeline */}
                        <Box sx={{ flexShrink: 0 }}>
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
                    </Box>
                </Grid>
            </Grid>
        </Container>
    );
}
