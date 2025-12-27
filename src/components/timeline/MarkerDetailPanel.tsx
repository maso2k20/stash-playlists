"use client";

import React from "react";
import {
    Box,
    Typography,
    Input,
    Button,
    Autocomplete,
    Chip,
    Card,
    IconButton,
    Tooltip,
} from "@mui/joy";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import RefreshIcon from "@mui/icons-material/Refresh";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import TimeInput from "@/components/TimeInput";
import type { Tag, Draft } from "@/types/markers";
import { formatSecondsToMMSS } from "@/lib/formatLength";

interface MarkerDetailPanelProps {
    selectedMarkerId: string | null;
    draft: Draft | null;
    tagOptions: Tag[];
    isNew: boolean;
    isDirty: boolean;
    isSaving: boolean;
    getCurrentTime: () => number;
    playerReady: boolean;
    timeClipboard: number | null;
    onTimeClipboardChange: (time: number | null) => void;
    onDraftChange: (patch: Partial<Draft>) => void;
    onSave: () => void;
    onReset: () => void;
    onDelete: () => void;
}

function MarkerDetailPanelInner({
    selectedMarkerId,
    draft,
    tagOptions,
    isNew,
    isDirty,
    isSaving,
    getCurrentTime,
    playerReady,
    timeClipboard,
    onTimeClipboardChange,
    onDraftChange,
    onSave,
    onReset,
    onDelete,
}: MarkerDetailPanelProps) {
    if (!selectedMarkerId || !draft) {
        return (
            <Card
                variant="outlined"
                sx={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "background.surface",
                }}
            >
                <Typography level="body-md" color="neutral">
                    Select a marker to edit
                </Typography>
            </Card>
        );
    }

    const primaryTag = draft.primary_tag_id
        ? tagOptions.find((t) => t.id === draft.primary_tag_id)
        : null;

    const selectedTags = tagOptions.filter((t) =>
        draft.tag_ids.includes(t.id) && t.id !== draft.primary_tag_id
    );

    // Get primary tag recommendations - tags with children, for when no primary tag is selected
    const primaryTagRecommendations = !draft.primary_tag_id
        ? tagOptions.filter(tag => tag.children && tag.children.length > 0).slice(0, 8)
        : [];

    // Get recommended tags based on primary tag children
    const recommendedTags = primaryTag?.children
        ? primaryTag.children.filter(child => !draft.tag_ids.includes(child.id))
        : [];

    // Handle selecting a primary tag from recommendations
    const handleSelectPrimaryTag = (tagId: string) => {
        onDraftChange({
            primary_tag_id: tagId,
            tag_ids: Array.from(new Set([tagId, ...draft.tag_ids])),
        });
    };

    // Handle adding a recommended tag
    const handleAddRecommendedTag = (tagId: string) => {
        onDraftChange({
            tag_ids: Array.from(new Set([...draft.tag_ids, tagId])),
        });
    };

    return (
        <Card
            variant="outlined"
            sx={{
                height: "100%",
                p: 1.5,
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
                backgroundColor: "background.surface",
                overflow: "auto",
            }}
        >
            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography level="title-md" sx={{ flex: 1 }}>
                    {isNew ? "New Marker" : "Edit Marker"}
                </Typography>
                {(isDirty || isNew) && (
                    <Chip size="sm" color="warning" variant="soft">
                        Unsaved
                    </Chip>
                )}
            </Box>

            {/* Title */}
            <Box>
                <Typography level="body-sm" sx={{ mb: 0.5 }}>
                    Title
                </Typography>
                <Input
                    size="sm"
                    value={draft.title}
                    onChange={(e) => onDraftChange({ title: e.target.value })}
                    placeholder="Enter marker title"
                />
            </Box>

            {/* Times */}
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
                <Box>
                    <Typography level="body-xs" sx={{ mb: 0.5 }}>
                        Start
                    </Typography>
                    <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                        <Tooltip title="Set to current video time" variant="soft">
                            <span>
                                <IconButton
                                    size="sm"
                                    variant="soft"
                                    disabled={!playerReady}
                                    onClick={() => onDraftChange({ seconds: Math.round(getCurrentTime()) })}
                                    sx={{ minWidth: 28, minHeight: 28 }}
                                >
                                    <AccessTimeIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <TimeInput
                            value={draft.seconds}
                            onChange={(seconds) => onDraftChange({ seconds })}
                            size="sm"
                            placeholder="0:00"
                            sx={{ width: 70, "& input": { textAlign: "center" } }}
                        />
                        <Tooltip title="Copy start time" variant="soft">
                            <IconButton
                                size="sm"
                                variant="plain"
                                onClick={() => onTimeClipboardChange(draft.seconds)}
                                sx={{ minWidth: 24, minHeight: 24, p: 0.25 }}
                            >
                                <ContentCopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title={timeClipboard !== null ? `Paste ${formatSecondsToMMSS(timeClipboard)}` : "No time copied"} variant="soft">
                            <span>
                                <IconButton
                                    size="sm"
                                    variant="plain"
                                    disabled={timeClipboard === null}
                                    onClick={() => {
                                    if (timeClipboard !== null) {
                                        onDraftChange({ seconds: timeClipboard });
                                        onTimeClipboardChange(null);
                                    }
                                }}
                                    sx={{ minWidth: 24, minHeight: 24, p: 0.25, opacity: timeClipboard === null ? 0.3 : 1 }}
                                >
                                    <ContentPasteIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Box>
                </Box>
                <Box>
                    <Typography level="body-xs" sx={{ mb: 0.5 }}>
                        End
                    </Typography>
                    <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                        <Tooltip title="Set to current video time" variant="soft">
                            <span>
                                <IconButton
                                    size="sm"
                                    variant="soft"
                                    disabled={!playerReady}
                                    onClick={() => onDraftChange({ end_seconds: Math.round(getCurrentTime()) })}
                                    sx={{ minWidth: 28, minHeight: 28 }}
                                >
                                    <AccessTimeIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <TimeInput
                            value={draft.end_seconds ?? 0}
                            onChange={(seconds) =>
                                onDraftChange({ end_seconds: seconds === 0 ? null : seconds })
                            }
                            size="sm"
                            placeholder="0:00"
                            sx={{ width: 70, "& input": { textAlign: "center" } }}
                        />
                        <Tooltip title="Copy end time" variant="soft">
                            <IconButton
                                size="sm"
                                variant="plain"
                                onClick={() => onTimeClipboardChange(draft.end_seconds ?? 0)}
                                sx={{ minWidth: 24, minHeight: 24, p: 0.25 }}
                            >
                                <ContentCopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title={timeClipboard !== null ? `Paste ${formatSecondsToMMSS(timeClipboard)}` : "No time copied"} variant="soft">
                            <span>
                                <IconButton
                                    size="sm"
                                    variant="plain"
                                    disabled={timeClipboard === null}
                                    onClick={() => {
                                    if (timeClipboard !== null) {
                                        onDraftChange({ end_seconds: timeClipboard === 0 ? null : timeClipboard });
                                        onTimeClipboardChange(null);
                                    }
                                }}
                                    sx={{ minWidth: 24, minHeight: 24, p: 0.25, opacity: timeClipboard === null ? 0.3 : 1 }}
                                >
                                    <ContentPasteIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Box>
                </Box>
            </Box>

            {/* Primary Tag */}
            <Box>
                <Typography level="body-sm" sx={{ mb: 0.5 }}>
                    Primary Tag *
                </Typography>
                <Autocomplete
                    size="sm"
                    options={tagOptions}
                    value={primaryTag || null}
                    onChange={(_e, val) => {
                        const newPrimaryId = val?.id ?? null;
                        onDraftChange({
                            primary_tag_id: newPrimaryId,
                            tag_ids: newPrimaryId
                                ? Array.from(new Set([newPrimaryId, ...draft.tag_ids.filter(id => id !== draft.primary_tag_id)]))
                                : draft.tag_ids.filter(id => id !== draft.primary_tag_id),
                        });
                    }}
                    getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
                    isOptionEqualToValue={(a, b) => a?.id === b?.id}
                    placeholder="Select primary tag..."
                />
                {/* Primary tag recommendations - only show when no primary tag selected */}
                {primaryTagRecommendations.length > 0 && (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                        {primaryTagRecommendations.map((tag) => (
                            <Chip
                                key={tag.id}
                                size="sm"
                                variant="soft"
                                color="success"
                                onClick={() => handleSelectPrimaryTag(tag.id)}
                                sx={{
                                    cursor: "pointer",
                                    "&:hover": {
                                        transform: "translateY(-1px)",
                                        boxShadow: "sm"
                                    }
                                }}
                            >
                                {tag.name}
                            </Chip>
                        ))}
                    </Box>
                )}
            </Box>

            {/* Other Tags */}
            <Box>
                <Typography level="body-sm" sx={{ mb: 0.5 }}>
                    Other Tags
                </Typography>
                <Autocomplete
                    size="sm"
                    multiple
                    options={tagOptions.filter((t) => t.id !== draft.primary_tag_id)}
                    value={selectedTags}
                    onChange={(_e, vals) => {
                        const newTagIds = vals.map((v) => v.id);
                        onDraftChange({
                            tag_ids: draft.primary_tag_id
                                ? Array.from(new Set([draft.primary_tag_id, ...newTagIds]))
                                : newTagIds,
                        });
                    }}
                    getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
                    isOptionEqualToValue={(a, b) => a?.id === b?.id}
                    placeholder="Add tags..."
                />
                {/* Recommended tags based on primary tag children */}
                {recommendedTags.length > 0 && (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                        {recommendedTags.map((tag) => (
                            <Chip
                                key={tag.id}
                                size="sm"
                                variant="soft"
                                color="primary"
                                onClick={() => handleAddRecommendedTag(tag.id)}
                                sx={{
                                    cursor: "pointer",
                                    "&:hover": {
                                        transform: "translateY(-1px)",
                                        boxShadow: "sm"
                                    }
                                }}
                            >
                                {tag.name}
                            </Chip>
                        ))}
                    </Box>
                )}
            </Box>

            {/* Spacer */}
            <Box sx={{ flex: 1 }} />

            {/* Actions */}
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                    size="sm"
                    variant="solid"
                    color="primary"
                    startDecorator={<SaveIcon />}
                    onClick={onSave}
                    loading={isSaving}
                    disabled={!draft.primary_tag_id || draft.seconds === null || draft.end_seconds === null}
                >
                    Save
                </Button>

                <Button
                    size="sm"
                    variant="soft"
                    color="neutral"
                    startDecorator={<RefreshIcon />}
                    onClick={onReset}
                    disabled={isSaving}
                >
                    Reset
                </Button>

                <Button
                    size="sm"
                    variant="soft"
                    color="danger"
                    startDecorator={<DeleteIcon />}
                    onClick={onDelete}
                    disabled={isSaving}
                >
                    Delete
                </Button>
            </Box>
        </Card>
    );
}

// Memoize to prevent re-renders from currentTime updates while typing
export const MarkerDetailPanel = React.memo(MarkerDetailPanelInner);
