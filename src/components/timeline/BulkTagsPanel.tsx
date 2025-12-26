"use client";

import { useState } from "react";
import {
    Box,
    Typography,
    Button,
    Autocomplete,
    Checkbox,
    Card,
    Chip,
} from "@mui/joy";
import type { Tag } from "@/types/markers";

interface BulkTagsPanelProps {
    tagOptions: Tag[];
    performerTags: Tag[];
    performerCount: number;
    performerCountRecommendations: Record<number, string>;
    savingAll: boolean;
    onApplyCommonTags: (tagIds: string[], remove: boolean) => void;
    onApplyPerformerTags: (tagIds: string[], remove: boolean) => void;
}

export function BulkTagsPanel({
    tagOptions,
    performerTags,
    performerCount,
    performerCountRecommendations,
    savingAll,
    onApplyCommonTags,
    onApplyPerformerTags,
}: BulkTagsPanelProps) {
    // Common Tags state
    const [commonTagIds, setCommonTagIds] = useState<string[]>([]);
    const [removeCommonMode, setRemoveCommonMode] = useState(false);

    // Performer Tags state
    const [selectedPerformerTagIds, setSelectedPerformerTagIds] = useState<string[]>(
        () => performerTags.map(t => t.id)
    );
    const [removePerformerMode, setRemovePerformerMode] = useState(false);

    // Get performer count recommendations
    const getPerformerCountRecommendedTags = (): Tag[] => {
        const recommendedTagId = performerCountRecommendations[performerCount];
        if (!recommendedTagId) return [];
        const recommendedTag = tagOptions.find(tag => tag.id === recommendedTagId);
        return recommendedTag ? [recommendedTag] : [];
    };

    const performerRecommendations = getPerformerCountRecommendedTags();

    const handleApplyCommon = () => {
        onApplyCommonTags(commonTagIds, removeCommonMode);
    };

    const handleApplyPerformer = () => {
        onApplyPerformerTags(selectedPerformerTagIds, removePerformerMode);
    };

    const handleResetPerformerTags = () => {
        setSelectedPerformerTagIds(performerTags.map(t => t.id));
    };

    return (
        <Card
            variant="outlined"
            sx={{
                p: 1.5,
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
                backgroundColor: "background.surface",
            }}
        >
            {/* Common Tags Section */}
            <Box>
                <Typography level="title-sm" sx={{ mb: 1 }}>
                    Common Tags
                </Typography>

                <Autocomplete
                    multiple
                    size="sm"
                    options={tagOptions}
                    value={commonTagIds
                        .map((id) => tagOptions.find((t) => t.id === id))
                        .filter(Boolean) as Tag[]}
                    onChange={(_e, vals) =>
                        setCommonTagIds(Array.from(new Set(vals.map((v) => v.id))))
                    }
                    getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
                    isOptionEqualToValue={(a, b) => a?.id === b?.id}
                    placeholder="Pick tags to add/remove..."
                    limitTags={3}
                />

                {/* Performer count recommendations */}
                {performerRecommendations.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                        <Typography level="body-xs" sx={{ mb: 0.5 }}>
                            Recommended for {performerCount} performer{performerCount !== 1 ? 's' : ''}:
                        </Typography>
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                            {performerRecommendations.map((tag) => (
                                <Chip
                                    key={tag.id}
                                    size="sm"
                                    variant="soft"
                                    color="warning"
                                    onClick={() => {
                                        if (!commonTagIds.includes(tag.id)) {
                                            setCommonTagIds(prev => [...prev, tag.id]);
                                        }
                                    }}
                                    sx={{
                                        cursor: "pointer",
                                        opacity: commonTagIds.includes(tag.id) ? 0.5 : 1,
                                        "&:hover": {
                                            transform: "translateY(-1px)",
                                            boxShadow: "sm"
                                        }
                                    }}
                                >
                                    {tag.name} {commonTagIds.includes(tag.id) && "✓"}
                                </Chip>
                            ))}
                        </Box>
                    </Box>
                )}

                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mt: 1 }}>
                    <Checkbox
                        size="sm"
                        label="Remove"
                        checked={removeCommonMode}
                        onChange={(e) => setRemoveCommonMode(e.target.checked)}
                    />
                    <Box sx={{ flexGrow: 1 }} />
                    <Button
                        size="sm"
                        variant="plain"
                        disabled={commonTagIds.length === 0 || savingAll}
                        onClick={() => setCommonTagIds([])}
                    >
                        Clear
                    </Button>
                    <Button
                        size="sm"
                        variant="outlined"
                        disabled={commonTagIds.length === 0 || savingAll}
                        onClick={handleApplyCommon}
                    >
                        Apply All
                    </Button>
                </Box>
            </Box>

            {/* Performer Tags Section */}
            {performerTags.length > 0 && (
                <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.5 }}>
                    <Typography level="title-sm" sx={{ mb: 1 }}>
                        Performer Tags
                    </Typography>

                    <Autocomplete
                        multiple
                        size="sm"
                        options={performerTags}
                        value={selectedPerformerTagIds
                            .map((id) => performerTags.find((t) => t.id === id))
                            .filter(Boolean) as Tag[]}
                        onChange={(_e, vals) =>
                            setSelectedPerformerTagIds(vals.map((v) => v.id))
                        }
                        getOptionLabel={(o) => (typeof o === "string" ? o : (o as Tag).name)}
                        isOptionEqualToValue={(a, b) => a?.id === b?.id}
                        placeholder="Select performer tags..."
                        limitTags={3}
                    />

                    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mt: 1 }}>
                        <Checkbox
                            size="sm"
                            label="Remove"
                            checked={removePerformerMode}
                            onChange={(e) => setRemovePerformerMode(e.target.checked)}
                        />
                        <Box sx={{ flexGrow: 1 }} />
                        <Button
                            size="sm"
                            variant="plain"
                            disabled={selectedPerformerTagIds.length === 0 || savingAll}
                            onClick={handleResetPerformerTags}
                        >
                            Reset
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            disabled={selectedPerformerTagIds.length === 0 || savingAll}
                            onClick={handleApplyPerformer}
                        >
                            Apply All
                        </Button>
                    </Box>
                </Box>
            )}
        </Card>
    );
}
