"use client";

import { useState, useRef } from "react";
import { Box, Typography } from "@mui/joy";
import type { MarkerWithLane } from "@/types/markers";
import { getMarkerColor } from "@/lib/timelineUtils";

interface TimelineMarkerBarProps {
    marker: MarkerWithLane;
    pixelsPerSecond: number;
    laneHeight: number;
    isSelected: boolean;
    onSelect: (id: string, addToSelection?: boolean) => void;
    onDoubleClick?: (id: string) => void;
    onDragEnd: (id: string, newStart: number, newEnd: number) => void;
    maxDuration: number;
}

export function TimelineMarkerBar({
    marker,
    pixelsPerSecond,
    laneHeight,
    isSelected,
    onSelect,
    onDoubleClick,
    onDragEnd,
    maxDuration,
}: TimelineMarkerBarProps) {
    const [isDragging, setIsDragging] = useState<"move" | "start" | "end" | null>(null);
    const [dragOffset, setDragOffset] = useState({ start: 0, end: 0 });
    const dragStartRef = useRef({ x: 0, originalStart: 0, originalEnd: 0 });

    const colors = getMarkerColor(marker);
    const left = marker.start * pixelsPerSecond + dragOffset.start;
    const width = Math.max(8, (marker.end - marker.start) * pixelsPerSecond + dragOffset.end - dragOffset.start);
    const top = marker.lane * laneHeight;

    const handleMouseDown = (
        e: React.MouseEvent,
        dragType: "move" | "start" | "end"
    ) => {
        e.preventDefault();
        e.stopPropagation();

        setIsDragging(dragType);
        dragStartRef.current = {
            x: e.clientX,
            originalStart: marker.start,
            originalEnd: marker.end,
        };

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - dragStartRef.current.x;
            const deltaSeconds = deltaX / pixelsPerSecond;

            if (dragType === "move") {
                // Move both start and end
                let newStart = dragStartRef.current.originalStart + deltaSeconds;
                let newEnd = dragStartRef.current.originalEnd + deltaSeconds;

                // Clamp to boundaries
                if (newStart < 0) {
                    newEnd -= newStart;
                    newStart = 0;
                }
                if (newEnd > maxDuration) {
                    newStart -= newEnd - maxDuration;
                    newEnd = maxDuration;
                }

                const startOffset = (newStart - marker.start) * pixelsPerSecond;
                const endOffset = (newEnd - marker.end) * pixelsPerSecond;
                setDragOffset({ start: startOffset, end: endOffset });
            } else if (dragType === "start") {
                // Move only start
                let newStart = dragStartRef.current.originalStart + deltaSeconds;
                newStart = Math.max(0, Math.min(newStart, marker.end - 1));
                const startOffset = (newStart - marker.start) * pixelsPerSecond;
                setDragOffset({ start: startOffset, end: 0 });
            } else if (dragType === "end") {
                // Move only end
                let newEnd = dragStartRef.current.originalEnd + deltaSeconds;
                newEnd = Math.max(marker.start + 1, Math.min(newEnd, maxDuration));
                const endOffset = (newEnd - marker.end) * pixelsPerSecond;
                setDragOffset({ start: 0, end: endOffset });
            }
        };

        const handleMouseUp = (upEvent: MouseEvent) => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);

            // Calculate final position from mouse coordinates (not from state which has closure issues)
            const deltaX = upEvent.clientX - dragStartRef.current.x;
            const deltaSeconds = deltaX / pixelsPerSecond;

            let newStart = dragStartRef.current.originalStart;
            let newEnd = dragStartRef.current.originalEnd;

            if (dragType === "move") {
                newStart = dragStartRef.current.originalStart + deltaSeconds;
                newEnd = dragStartRef.current.originalEnd + deltaSeconds;
                // Clamp to boundaries
                if (newStart < 0) {
                    newEnd -= newStart;
                    newStart = 0;
                }
                if (newEnd > maxDuration) {
                    newStart -= newEnd - maxDuration;
                    newEnd = maxDuration;
                }
            } else if (dragType === "start") {
                newStart = dragStartRef.current.originalStart + deltaSeconds;
                newStart = Math.max(0, Math.min(newStart, dragStartRef.current.originalEnd - 1));
            } else if (dragType === "end") {
                newEnd = dragStartRef.current.originalEnd + deltaSeconds;
                newEnd = Math.max(dragStartRef.current.originalStart + 1, Math.min(newEnd, maxDuration));
            }

            // Round to 0.1 seconds
            newStart = Math.round(newStart * 10) / 10;
            newEnd = Math.round(newEnd * 10) / 10;

            setIsDragging(null);
            setDragOffset({ start: 0, end: 0 });

            if (newStart !== marker.start || newEnd !== marker.end) {
                onDragEnd(marker.id, newStart, newEnd);
            }
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isDragging) {
            // Blur any focused element so keyboard shortcuts work
            (document.activeElement as HTMLElement)?.blur?.();
            // Ctrl/Cmd+click adds to selection
            const addToSelection = e.ctrlKey || e.metaKey;
            onSelect(marker.id, addToSelection);
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onDoubleClick) {
            onDoubleClick(marker.id);
        }
    };

    return (
        <Box
            data-marker-bar
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onMouseDown={(e) => handleMouseDown(e, "move")}
            sx={{
                position: "absolute",
                left,
                top,
                width,
                height: laneHeight - 4,
                backgroundColor: colors.background,
                border: `2px solid ${isSelected ? "#00E676" : colors.border}`,
                borderRadius: "4px",
                cursor: isDragging ? "grabbing" : "grab",
                pointerEvents: "auto",
                display: "flex",
                alignItems: "center",
                overflow: "hidden",
                transition: isDragging ? "none" : "box-shadow 0.2s, border-color 0.2s",
                boxShadow: isSelected
                    ? "0 0 0 3px rgba(0, 230, 118, 0.4), 0 0 12px rgba(0, 230, 118, 0.5), 0 2px 8px rgba(0,0,0,0.3)"
                    : "0 1px 3px rgba(0,0,0,0.2)",
                "&:hover": {
                    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                },
                zIndex: isSelected ? 10 : marker.lane + 1,
            }}
        >
            {/* Left resize handle */}
            <Box
                onMouseDown={(e) => {
                    e.stopPropagation();
                    handleMouseDown(e, "start");
                }}
                sx={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: 8,
                    height: "100%",
                    cursor: "ew-resize",
                    backgroundColor: "transparent",
                    "&:hover": {
                        backgroundColor: "rgba(255,255,255,0.2)",
                    },
                }}
            />

            {/* Content */}
            <Typography
                level="body-xs"
                sx={{
                    color: colors.text,
                    px: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontSize: "11px",
                    fontWeight: isSelected ? 600 : 400,
                    pointerEvents: "none",
                    flex: 1,
                    textAlign: "center",
                }}
            >
                {marker.primaryTagName || marker.title || "Untitled"}
            </Typography>

            {/* Right resize handle */}
            <Box
                onMouseDown={(e) => {
                    e.stopPropagation();
                    handleMouseDown(e, "end");
                }}
                sx={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    width: 8,
                    height: "100%",
                    cursor: "ew-resize",
                    backgroundColor: "transparent",
                    "&:hover": {
                        backgroundColor: "rgba(255,255,255,0.2)",
                    },
                }}
            />
        </Box>
    );
}
