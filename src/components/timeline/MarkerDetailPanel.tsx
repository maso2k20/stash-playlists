"use client";

import {
    Box,
    Typography,
    Input,
    Button,
    Autocomplete,
    Chip,
    Card,
} from "@mui/joy";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import RefreshIcon from "@mui/icons-material/Refresh";
import TimeInput from "@/components/TimeInput";
import type { Tag, Draft } from "@/types/markers";

interface MarkerDetailPanelProps {
    selectedMarkerId: string | null;
    draft: Draft | null;
    tagOptions: Tag[];
    isNew: boolean;
    isDirty: boolean;
    isSaving: boolean;
    onDraftChange: (patch: Partial<Draft>) => void;
    onSave: () => void;
    onReset: () => void;
    onDelete: () => void;
}

export function MarkerDetailPanel({
    selectedMarkerId,
    draft,
    tagOptions,
    isNew,
    isDirty,
    isSaving,
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

    return (
        <Card
            variant="outlined"
            sx={{
                height: "100%",
                p: 2,
                display: "flex",
                flexDirection: "column",
                gap: 2,
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
            <Box sx={{ display: "flex", gap: 2 }}>
                <Box sx={{ flex: 1 }}>
                    <Typography level="body-sm" sx={{ mb: 0.5 }}>
                        Start Time
                    </Typography>
                    <TimeInput
                        value={draft.seconds}
                        onChange={(seconds) => onDraftChange({ seconds })}
                        size="sm"
                        placeholder="0:00"
                    />
                </Box>
                <Box sx={{ flex: 1 }}>
                    <Typography level="body-sm" sx={{ mb: 0.5 }}>
                        End Time
                    </Typography>
                    <TimeInput
                        value={draft.end_seconds ?? 0}
                        onChange={(seconds) =>
                            onDraftChange({ end_seconds: seconds === 0 ? null : seconds })
                        }
                        size="sm"
                        placeholder="0:00"
                    />
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
