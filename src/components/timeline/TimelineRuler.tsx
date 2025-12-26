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
                {ticks.map(({ time, position, label, isMajor }) => (
                    <Box
                        key={time}
                        sx={{
                            position: "absolute",
                            left: position,
                            top: 0,
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                        }}
                    >
                        {/* Tick mark */}
                        <Box
                            sx={{
                                width: 1,
                                height: isMajor ? 12 : 6,
                                backgroundColor: isMajor
                                    ? "text.primary"
                                    : "text.tertiary",
                                opacity: isMajor ? 0.7 : 0.4,
                            }}
                        />
                        {/* Label */}
                        {isMajor && (
                            <Typography
                                level="body-xs"
                                sx={{
                                    fontSize: "10px",
                                    color: "text.secondary",
                                    whiteSpace: "nowrap",
                                    transform: "translateX(-50%)",
                                    mt: 0.25,
                                }}
                            >
                                {label}
                            </Typography>
                        )}
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
