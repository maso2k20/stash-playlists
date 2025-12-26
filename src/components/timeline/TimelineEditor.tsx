"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Box, Button, IconButton, Tooltip, Typography } from "@mui/joy";
import AddIcon from "@mui/icons-material/Add";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import { TimelineRuler } from "./TimelineRuler";
import { TimelineTrack, LANE_HEIGHT } from "./TimelineTrack";
import { TimelinePlayhead } from "./TimelinePlayhead";
import type { MarkerForTimeline, MarkerWithLane } from "@/types/markers";
import {
    assignMarkerLanes,
    calculatePixelsPerSecond,
    getMaxLanes,
} from "@/lib/timelineUtils";

interface TimelineEditorProps {
    markers: MarkerForTimeline[];
    duration: number;
    currentTime: number;
    selectedMarkerId: string | null;
    onMarkerSelect: (id: string) => void;
    onMarkerDragEnd: (id: string, newStart: number, newEnd: number) => void;
    onSeek: (time: number) => void;
    onAddMarker: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 10;
const ZOOM_STEP = 0.25;

// Format time as MM:SS or HH:MM:SS if over an hour
function formatTime(seconds: number): string {
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function TimelineEditor({
    markers,
    duration,
    currentTime,
    selectedMarkerId,
    onMarkerSelect,
    onMarkerDragEnd,
    onSeek,
    onAddMarker,
}: TimelineEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(800);
    const [zoom, setZoom] = useState(1);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

    // Observe container width
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });

        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, []);

    // Calculate layout
    const pixelsPerSecond = useMemo(
        () => calculatePixelsPerSecond(containerWidth, duration, zoom),
        [containerWidth, duration, zoom]
    );

    const totalWidth = duration * pixelsPerSecond;

    // Assign markers to lanes
    const markersWithLanes: MarkerWithLane[] = useMemo(
        () => assignMarkerLanes(markers),
        [markers]
    );

    const numLanes = Math.max(2, getMaxLanes(markersWithLanes));
    const trackHeight = numLanes * LANE_HEIGHT;
    const totalTimelineHeight = 28 + trackHeight; // ruler + tracks

    // Playhead position
    const playheadPosition = currentTime * pixelsPerSecond - scrollLeft;

    // Zoom controls
    const handleZoomIn = () => {
        setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
    };

    const handleZoomOut = () => {
        setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
    };

    const handleFitToView = () => {
        // Calculate zoom to fit all content
        if (duration > 0 && containerWidth > 0) {
            const fitZoom = containerWidth / duration / 100 * 100; // normalize
            setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, 1)));
            setScrollLeft(0);
        }
    };

    // Scroll handling
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setScrollLeft(e.currentTarget.scrollLeft);
    }, []);

    // Keep playhead in view during playback
    useEffect(() => {
        if (isDraggingPlayhead) return;

        const playheadX = currentTime * pixelsPerSecond;
        const viewStart = scrollLeft;
        const viewEnd = scrollLeft + containerWidth;

        // Auto-scroll if playhead goes out of view
        if (playheadX > viewEnd - 50) {
            const scrollContainer = containerRef.current?.querySelector(
                "[data-timeline-scroll]"
            ) as HTMLDivElement;
            if (scrollContainer) {
                scrollContainer.scrollLeft = playheadX - containerWidth + 100;
            }
        }
    }, [currentTime, pixelsPerSecond, scrollLeft, containerWidth, isDraggingPlayhead]);

    // Handle timeline click to seek
    const handleTimelineClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left + scrollLeft;
            const time = clickX / pixelsPerSecond;
            onSeek(Math.max(0, Math.min(time, duration)));
        },
        [scrollLeft, pixelsPerSecond, duration, onSeek]
    );

    // Handle clicking track area (not on a marker)
    const handleTrackClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            // Only handle if clicking directly on the track container
            if (e.target === e.currentTarget) {
                onMarkerSelect(""); // Deselect
            }
        },
        [onMarkerSelect]
    );

    return (
        <Box
            ref={containerRef}
            sx={{
                display: "flex",
                flexDirection: "column",
                backgroundColor: "background.level1",
                borderRadius: "lg",
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
                height: "100%",
            }}
        >
            {/* Controls bar */}
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1.5,
                    py: 0.75,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    backgroundColor: "background.surface",
                }}
            >
                {/* Zoom controls */}
                <Tooltip title="Zoom out" variant="soft">
                    <IconButton
                        size="sm"
                        variant="soft"
                        onClick={handleZoomOut}
                        disabled={zoom <= MIN_ZOOM}
                    >
                        <ZoomOutIcon fontSize="small" />
                    </IconButton>
                </Tooltip>

                <Typography level="body-xs" sx={{ minWidth: 40, textAlign: "center" }}>
                    {Math.round(zoom * 100)}%
                </Typography>

                <Tooltip title="Zoom in" variant="soft">
                    <IconButton
                        size="sm"
                        variant="soft"
                        onClick={handleZoomIn}
                        disabled={zoom >= MAX_ZOOM}
                    >
                        <ZoomInIcon fontSize="small" />
                    </IconButton>
                </Tooltip>

                <Tooltip title="Fit to view" variant="soft">
                    <IconButton size="sm" variant="soft" onClick={handleFitToView}>
                        <FitScreenIcon fontSize="small" />
                    </IconButton>
                </Tooltip>

                <Box sx={{ flex: 1 }} />

                {/* Time display */}
                <Typography
                    level="body-sm"
                    sx={{
                        fontFamily: "monospace",
                        color: "text.secondary",
                        minWidth: 100,
                        textAlign: "right",
                    }}
                >
                    {formatTime(currentTime)} / {formatTime(duration)}
                </Typography>

                {/* Add marker button */}
                <Button
                    size="sm"
                    variant="soft"
                    color="primary"
                    startDecorator={<AddIcon />}
                    onClick={onAddMarker}
                >
                    New Marker
                </Button>
            </Box>

            {/* Timeline content (scrollable) */}
            <Box
                data-timeline-scroll
                onScroll={handleScroll}
                sx={{
                    position: "relative",
                    overflowX: "auto",
                    overflowY: "hidden",
                }}
            >
                <Box
                    sx={{
                        position: "relative",
                        width: totalWidth,
                        minWidth: containerWidth,
                    }}
                >
                    {/* Ruler */}
                    <TimelineRuler
                        duration={duration}
                        pixelsPerSecond={pixelsPerSecond}
                        scrollLeft={scrollLeft}
                        containerWidth={containerWidth}
                        onSeek={onSeek}
                    />

                    {/* Track area */}
                    <Box
                        onClick={handleTrackClick}
                        sx={{ position: "relative" }}
                    >
                        <TimelineTrack
                            markers={markersWithLanes}
                            pixelsPerSecond={pixelsPerSecond}
                            scrollLeft={0} // Track handles its own positioning
                            selectedMarkerId={selectedMarkerId}
                            duration={duration}
                            onMarkerSelect={onMarkerSelect}
                            onMarkerDragEnd={onMarkerDragEnd}
                        />

                        {/* Playhead */}
                        <TimelinePlayhead
                            position={currentTime * pixelsPerSecond}
                            height={trackHeight}
                            isDragging={isDraggingPlayhead}
                        />
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
