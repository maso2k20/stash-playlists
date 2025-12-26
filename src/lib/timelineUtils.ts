import type { MarkerForTimeline, MarkerWithLane } from "@/types/markers";

/**
 * Assign markers to lanes to handle overlapping markers.
 * Markers that overlap will be placed in different lanes.
 */
export function assignMarkerLanes(markers: MarkerForTimeline[]): MarkerWithLane[] {
    // Sort by start time
    const sorted = [...markers].sort((a, b) => a.start - b.start);

    // Track the end time of each lane
    const laneEnds: number[] = [];

    return sorted.map((marker) => {
        // Find the first lane where this marker can fit (lane end <= marker start)
        let lane = laneEnds.findIndex((endTime) => endTime <= marker.start);

        if (lane === -1) {
            // No available lane, create a new one
            lane = laneEnds.length;
        }

        // Update the lane's end time
        laneEnds[lane] = marker.end;

        return { ...marker, lane };
    });
}

/**
 * Calculate the number of lanes needed for a set of markers
 */
export function getMaxLanes(markers: MarkerWithLane[]): number {
    if (markers.length === 0) return 1;
    return Math.max(...markers.map((m) => m.lane)) + 1;
}

/**
 * Convert seconds to pixel position based on zoom level
 */
export function secondsToPixels(seconds: number, pixelsPerSecond: number): number {
    return seconds * pixelsPerSecond;
}

/**
 * Convert pixel position to seconds based on zoom level
 */
export function pixelsToSeconds(pixels: number, pixelsPerSecond: number): number {
    return pixels / pixelsPerSecond;
}

/**
 * Calculate pixels per second based on container width, duration, and zoom
 */
export function calculatePixelsPerSecond(
    containerWidth: number,
    duration: number,
    zoom: number
): number {
    if (duration <= 0) return 100;
    return (containerWidth * zoom) / duration;
}

/**
 * Generate tick marks for the timeline ruler
 */
export function generateRulerTicks(
    duration: number,
    pixelsPerSecond: number,
    containerWidth: number
): { time: number; position: number; label: string; isMajor: boolean }[] {
    const ticks: { time: number; position: number; label: string; isMajor: boolean }[] = [];

    // Determine tick interval based on zoom level
    let interval: number;
    if (pixelsPerSecond >= 100) {
        interval = 5; // 5 second intervals at high zoom
    } else if (pixelsPerSecond >= 50) {
        interval = 10; // 10 second intervals
    } else if (pixelsPerSecond >= 20) {
        interval = 30; // 30 second intervals
    } else if (pixelsPerSecond >= 10) {
        interval = 60; // 1 minute intervals
    } else {
        interval = 120; // 2 minute intervals at low zoom
    }

    const majorInterval = interval * 2;

    for (let time = 0; time <= duration; time += interval) {
        const position = time * pixelsPerSecond;
        if (position > containerWidth * 2) break; // Don't generate too many ticks

        const isMajor = time % majorInterval === 0;
        const label = formatTimeLabel(time);

        ticks.push({ time, position, label, isMajor });
    }

    return ticks;
}

/**
 * Format time in seconds to MM:SS or HH:MM:SS
 */
export function formatTimeLabel(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Snap a time value to the nearest interval (for snapping to grid)
 */
export function snapToInterval(time: number, interval: number): number {
    return Math.round(time / interval) * interval;
}

/**
 * Get marker color based on state
 */
export function getMarkerColor(marker: MarkerForTimeline): {
    background: string;
    border: string;
    text: string;
} {
    if (marker.isActive) {
        return {
            background: "rgba(33, 150, 243, 0.8)",
            border: "#2196F3",
            text: "#fff",
        };
    }
    if (marker.isDirty) {
        return {
            background: "rgba(255, 152, 0, 0.6)",
            border: "#FF9800",
            text: "#fff",
        };
    }
    if (marker.isNew) {
        return {
            background: "rgba(76, 175, 80, 0.6)",
            border: "#4CAF50",
            text: "#fff",
        };
    }
    return {
        background: "rgba(100, 149, 237, 0.5)",
        border: "rgba(100, 149, 237, 0.8)",
        text: "#fff",
    };
}
