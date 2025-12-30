"use client";

import { useState, useRef, useCallback } from "react";
import { Box } from "@mui/joy";
import type { MarkerWithLane, SelectionRect } from "@/types/markers";
import { TimelineMarkerBar } from "./TimelineMarkerBar";
import { getMaxLanes, getMarkersInSelection } from "@/lib/timelineUtils";

interface TimelineTrackProps {
    markers: MarkerWithLane[];
    pixelsPerSecond: number;
    scrollLeft: number;
    selectedMarkerId: string | null; // For backward compat, but we use marker.isActive for selection
    duration: number;
    onMarkerSelect: (id: string, addToSelection?: boolean) => void;
    onSetSelection?: (ids: string[]) => void; // For drag-selection to set multiple markers at once
    onMarkerDoubleClick?: (id: string) => void;
    onMarkerDragEnd: (id: string, newStart: number, newEnd: number) => void;
}

const LANE_HEIGHT = 32;
const MIN_LANES = 2;

export function TimelineTrack({
    markers,
    pixelsPerSecond,
    scrollLeft,
    selectedMarkerId,
    duration,
    onMarkerSelect,
    onSetSelection,
    onMarkerDoubleClick,
    onMarkerDragEnd,
}: TimelineTrackProps) {
    const numLanes = Math.max(MIN_LANES, getMaxLanes(markers));
    const totalHeight = numLanes * LANE_HEIGHT;
    const totalWidth = duration * pixelsPerSecond;

    // Drag-selection state
    const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
    const [isDragSelecting, setIsDragSelecting] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Handle mouse down for drag-selection
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        // Only left click
        if (e.button !== 0) return;

        // Get the container rect (the hit area matches the container size)
        const rect = e.currentTarget.getBoundingClientRect();
        const startX = e.clientX - rect.left + scrollLeft;
        const startY = e.clientY - rect.top;

        setSelectionRect({
            startX,
            startY,
            endX: startX,
            endY: startY,
        });
        setIsDragSelecting(true);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const endX = moveEvent.clientX - rect.left + scrollLeft;
            const endY = moveEvent.clientY - rect.top;
            setSelectionRect((prev) => prev ? { ...prev, endX, endY } : null);
        };

        const handleMouseUp = (upEvent: MouseEvent) => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);

            // Calculate final selection rect
            const endX = upEvent.clientX - rect.left + scrollLeft;
            const endY = upEvent.clientY - rect.top;

            const finalRect: SelectionRect = {
                startX,
                startY,
                endX,
                endY,
            };

            // Find markers in selection
            const selectedIds = getMarkersInSelection(
                markers,
                finalRect,
                pixelsPerSecond,
                LANE_HEIGHT,
                0 // scrollLeft already added to coordinates
            );

            // Update selection
            if (onSetSelection && selectedIds.length > 0) {
                onSetSelection(selectedIds);
            } else if (selectedIds.length === 0) {
                // Click on empty space with no drag = deselect
                onMarkerSelect("", false);
            }

            setSelectionRect(null);
            setIsDragSelecting(false);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [markers, pixelsPerSecond, scrollLeft, onMarkerSelect, onSetSelection]);

    // Compute selection overlay position (handle dragging in any direction)
    const overlayStyle = selectionRect ? {
        left: Math.min(selectionRect.startX, selectionRect.endX) - scrollLeft,
        top: Math.min(selectionRect.startY, selectionRect.endY),
        width: Math.abs(selectionRect.endX - selectionRect.startX),
        height: Math.abs(selectionRect.endY - selectionRect.startY),
    } : null;

    return (
        <Box
            ref={containerRef}
            onMouseDown={handleMouseDown}
            sx={{
                position: "relative",
                minHeight: totalHeight,
                height: "100%",
                backgroundColor: "background.surface",
                overflow: "hidden",
                cursor: "crosshair",
            }}
        >
            {/* Track background with lane guides */}
            <Box
                sx={{
                    position: "absolute",
                    top: 0,
                    left: -scrollLeft,
                    width: totalWidth,
                    height: "100%",
                    pointerEvents: "none",
                }}
            >
                {/* Lane separator lines */}
                {Array.from({ length: numLanes }).map((_, i) => (
                    <Box
                        key={i}
                        sx={{
                            position: "absolute",
                            top: i * LANE_HEIGHT,
                            left: 0,
                            right: 0,
                            height: LANE_HEIGHT,
                            borderBottom: "1px solid",
                            borderColor: "divider",
                            backgroundColor:
                                i % 2 === 0
                                    ? "transparent"
                                    : "rgba(255,255,255,0.02)",
                        }}
                    />
                ))}
            </Box>

            {/* Marker bars - separate layer with pointer events */}
            <Box
                sx={{
                    position: "absolute",
                    top: 0,
                    left: -scrollLeft,
                    width: totalWidth,
                    height: "100%",
                    pointerEvents: "none",
                }}
            >
                {markers.map((marker) => (
                    <TimelineMarkerBar
                        key={marker.id}
                        marker={marker}
                        pixelsPerSecond={pixelsPerSecond}
                        laneHeight={LANE_HEIGHT}
                        isSelected={marker.isActive}
                        onSelect={onMarkerSelect}
                        onDoubleClick={onMarkerDoubleClick}
                        onDragEnd={onMarkerDragEnd}
                        maxDuration={duration}
                    />
                ))}
            </Box>

            {/* Selection rectangle overlay */}
            {isDragSelecting && overlayStyle && overlayStyle.width > 2 && overlayStyle.height > 2 && (
                <Box
                    sx={{
                        position: "absolute",
                        ...overlayStyle,
                        backgroundColor: "rgba(33, 150, 243, 0.15)",
                        border: "1px dashed rgba(33, 150, 243, 0.6)",
                        borderRadius: "2px",
                        pointerEvents: "none",
                        zIndex: 100,
                    }}
                />
            )}
        </Box>
    );
}

export { LANE_HEIGHT };
