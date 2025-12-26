"use client";

import { Box } from "@mui/joy";
import type { MarkerWithLane } from "@/types/markers";
import { TimelineMarkerBar } from "./TimelineMarkerBar";
import { getMaxLanes } from "@/lib/timelineUtils";

interface TimelineTrackProps {
    markers: MarkerWithLane[];
    pixelsPerSecond: number;
    scrollLeft: number;
    selectedMarkerId: string | null;
    duration: number;
    onMarkerSelect: (id: string) => void;
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
    onMarkerDragEnd,
}: TimelineTrackProps) {
    const numLanes = Math.max(MIN_LANES, getMaxLanes(markers));
    const totalHeight = numLanes * LANE_HEIGHT;
    const totalWidth = duration * pixelsPerSecond;

    return (
        <Box
            sx={{
                position: "relative",
                height: totalHeight,
                backgroundColor: "background.surface",
                overflow: "hidden",
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

                {/* Marker bars */}
                {markers.map((marker) => (
                    <TimelineMarkerBar
                        key={marker.id}
                        marker={marker}
                        pixelsPerSecond={pixelsPerSecond}
                        laneHeight={LANE_HEIGHT}
                        isSelected={marker.id === selectedMarkerId}
                        onSelect={onMarkerSelect}
                        onDragEnd={onMarkerDragEnd}
                        maxDuration={duration}
                    />
                ))}
            </Box>
        </Box>
    );
}

export { LANE_HEIGHT };
