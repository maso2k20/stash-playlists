"use client";

import { Box } from "@mui/joy";

interface TimelinePlayheadProps {
    position: number; // position in pixels from left
    height: number; // total height of the timeline
    isDragging?: boolean;
}

export function TimelinePlayhead({ position, height, isDragging }: TimelinePlayheadProps) {
    return (
        <Box
            sx={{
                position: "absolute",
                left: position,
                top: 0,
                height: height,
                width: 2,
                backgroundColor: isDragging ? "#FF5722" : "#F44336",
                zIndex: 100,
                pointerEvents: "none",
                transition: isDragging ? "none" : "left 0.05s linear",
                "&::before": {
                    content: '""',
                    position: "absolute",
                    top: 0,
                    left: -5,
                    width: 0,
                    height: 0,
                    borderLeft: "6px solid transparent",
                    borderRight: "6px solid transparent",
                    borderTop: `8px solid ${isDragging ? "#FF5722" : "#F44336"}`,
                },
                boxShadow: isDragging
                    ? "0 0 8px rgba(244, 67, 54, 0.5)"
                    : "0 0 4px rgba(244, 67, 54, 0.3)",
            }}
        />
    );
}
