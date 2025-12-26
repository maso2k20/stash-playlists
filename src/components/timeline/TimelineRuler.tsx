"use client";

import { Box, Typography } from "@mui/joy";
import { generateRulerTicks } from "@/lib/timelineUtils";

interface TimelineRulerProps {
    duration: number;
    pixelsPerSecond: number;
    scrollLeft: number;
    containerWidth: number;
    onSeek: (time: number) => void;
}

export function TimelineRuler({
    duration,
    pixelsPerSecond,
    scrollLeft,
    containerWidth,
    onSeek,
}: TimelineRulerProps) {
    const totalWidth = duration * pixelsPerSecond;
    const ticks = generateRulerTicks(duration, pixelsPerSecond, containerWidth + scrollLeft);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left + scrollLeft;
        const time = clickX / pixelsPerSecond;
        onSeek(Math.max(0, Math.min(time, duration)));
    };

    return (
        <Box
            onClick={handleClick}
            sx={{
                position: "relative",
                height: 28,
                backgroundColor: "background.level1",
                borderBottom: "1px solid",
                borderColor: "divider",
                cursor: "pointer",
                userSelect: "none",
                overflow: "hidden",
            }}
        >
            <Box
                sx={{
                    position: "absolute",
                    top: 0,
                    left: -scrollLeft,
                    width: totalWidth,
                    height: "100%",
                }}
            >
                {ticks.filter(t => t.isMajor).map(({ time, position, label }) => {
                    // Adjust alignment for edge labels to prevent clipping
                    const isFirst = time === 0;
                    const isLast = position >= totalWidth - 30;
                    const padding = 6; // Padding from edges

                    return (
                        <Box
                            key={time}
                            sx={{
                                position: "absolute",
                                left: isFirst ? padding : isLast ? position - padding : position,
                                top: 0,
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                            }}
                        >
                            <Typography
                                level="body-xs"
                                sx={{
                                    fontSize: "10px",
                                    color: "text.secondary",
                                    whiteSpace: "nowrap",
                                    transform: isFirst
                                        ? "translateX(0)"
                                        : isLast
                                            ? "translateX(-100%)"
                                            : "translateX(-50%)",
                                }}
                            >
                                {label}
                            </Typography>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}
