// src/components/BuildPlaylistsDialog.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  Modal,
  ModalDialog,
  ModalClose,
  Divider,
  Stack,
  Sheet,
  Checkbox,
  Chip,
  CircularProgress,
  Alert,
} from "@mui/joy";
import { Layers, Check, AlertTriangle } from "lucide-react";
import { useStashTags } from "@/context/StashTagsContext";

type PlaylistTemplate = {
  id: string;
  name: string;
  tagIds: string[];
};

type BuildResult = {
  created: Array<{
    templateName: string;
    playlistId: string;
    playlistName: string;
    itemCount: number;
  }>;
  skipped: Array<{
    templateName: string;
    reason: string;
  }>;
  errors: Array<{
    templateName: string;
    error: string;
  }>;
};

interface BuildPlaylistsDialogProps {
  open: boolean;
  onClose: () => void;
  actorId: string;
  actorName: string;
  onSuccess?: () => void;
}

export default function BuildPlaylistsDialog({
  open,
  onClose,
  actorId,
  actorName,
  onSuccess,
}: BuildPlaylistsDialogProps) {
  const { stashTags } = useStashTags();
  const [templates, setTemplates] = useState<PlaylistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<BuildResult | null>(null);

  // Fetch templates when dialog opens
  useEffect(() => {
    if (open) {
      fetchTemplates();
      setResult(null);
      setSelectedIds(new Set());
    }
  }, [open]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/templates");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTemplates(data);
      // Select all by default
      setSelectedIds(new Set(data.map((t: PlaylistTemplate) => t.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const getTagName = (tagId: string): string => {
    const tag = stashTags?.find((t: { id: string | number; name: string }) => String(t.id) === tagId);
    return tag?.name || tagId;
  };

  const toggleTemplate = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(templates.map((t) => t.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const previewPlaylists = useMemo(() => {
    return templates
      .filter((t) => selectedIds.has(t.id))
      .map((t) => `${actorName} ${t.name}`);
  }, [templates, selectedIds, actorName]);

  const handleBuild = async () => {
    if (selectedIds.size === 0) return;

    setBuilding(true);
    setResult(null);

    try {
      const res = await fetch(`/api/actors/${actorId}/build-playlists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateIds: Array.from(selectedIds),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setResult(data);

      if (data.created?.length > 0 && onSuccess) {
        onSuccess();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build playlists");
    } finally {
      setBuilding(false);
    }
  };

  const handleClose = () => {
    if (!building) {
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog sx={{ minWidth: 500, maxWidth: 600, bgcolor: "background.surface" }}>
        <ModalClose disabled={building} />
        <Typography level="title-lg" startDecorator={<Layers size={20} />}>
          Build Playlists from Templates
        </Typography>
        <Divider />

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress size="sm" />
          </Box>
        ) : error && !result ? (
          <Alert color="danger" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : result ? (
          // Show results
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography level="title-md">Results</Typography>

            {result.created.length > 0 && (
              <Box>
                <Typography
                  level="body-sm"
                  startDecorator={<Check size={14} />}
                  sx={{ color: "success.600", mb: 1 }}
                >
                  Created {result.created.length} playlist(s)
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, ml: 3 }}>
                  {result.created.map((item) => (
                    <Typography key={item.playlistId} level="body-xs">
                      {item.playlistName} ({item.itemCount} items)
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}

            {result.skipped.length > 0 && (
              <Box>
                <Typography
                  level="body-sm"
                  startDecorator={<AlertTriangle size={14} />}
                  sx={{ color: "warning.600", mb: 1 }}
                >
                  Skipped {result.skipped.length} template(s)
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, ml: 3 }}>
                  {result.skipped.map((item, i) => (
                    <Typography key={i} level="body-xs" sx={{ color: "neutral.600" }}>
                      {item.templateName}: {item.reason}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}

            {result.errors.length > 0 && (
              <Alert color="danger">
                {result.errors.length} error(s) occurred during creation
              </Alert>
            )}

            <Stack direction="row" justifyContent="flex-end" sx={{ pt: 2 }}>
              <Button onClick={handleClose}>Close</Button>
            </Stack>
          </Stack>
        ) : templates.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography level="body-sm" sx={{ color: "neutral.600", mb: 2 }}>
              No templates available. Create templates in Settings to use this feature.
            </Typography>
            <Button variant="plain" onClick={handleClose}>
              Close
            </Button>
          </Box>
        ) : (
          // Show template selection
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography level="body-sm" sx={{ color: "neutral.600" }}>
                Select templates to create playlists for <strong>{actorName}</strong>
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button size="sm" variant="plain" onClick={selectAll}>
                  Select All
                </Button>
                <Button size="sm" variant="plain" onClick={deselectAll}>
                  Deselect All
                </Button>
              </Box>
            </Box>

            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
              {templates.map((template) => (
                <Sheet
                  key={template.id}
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: "md",
                    cursor: "pointer",
                    bgcolor: selectedIds.has(template.id)
                      ? "primary.900"
                      : "background.level1",
                    borderColor: selectedIds.has(template.id)
                      ? "primary.500"
                      : "neutral.700",
                    "&:hover": {
                      bgcolor: selectedIds.has(template.id)
                        ? "primary.800"
                        : "background.level2",
                    },
                  }}
                  onClick={() => toggleTemplate(template.id)}
                >
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                    <Checkbox
                      checked={selectedIds.has(template.id)}
                      onChange={() => toggleTemplate(template.id)}
                      sx={{ mt: 0.5 }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Typography level="title-sm">{template.name}</Typography>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                        {template.tagIds.map((tagId) => (
                          <Chip key={tagId} size="sm" variant="soft" color="primary">
                            {getTagName(tagId)}
                          </Chip>
                        ))}
                      </Box>
                    </Box>
                  </Box>
                </Sheet>
              ))}
            </Box>

            {selectedIds.size > 0 && (
              <Box sx={{ p: 2, bgcolor: "background.level1", borderRadius: "md", border: "1px solid", borderColor: "neutral.700" }}>
                <Typography level="body-xs" sx={{ color: "neutral.600", mb: 1 }}>
                  Will create {selectedIds.size} playlist(s):
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {previewPlaylists.map((name, i) => (
                    <Chip key={i} size="sm" variant="outlined">
                      {name}
                    </Chip>
                  ))}
                </Box>
              </Box>
            )}

            <Stack direction="row" gap={1.5} justifyContent="flex-end" sx={{ pt: 2 }}>
              <Button variant="plain" onClick={handleClose} disabled={building}>
                Cancel
              </Button>
              <Button
                onClick={handleBuild}
                loading={building}
                disabled={selectedIds.size === 0}
                startDecorator={<Layers size={14} />}
              >
                Build {selectedIds.size} Playlist{selectedIds.size !== 1 ? "s" : ""}
              </Button>
            </Stack>
          </Stack>
        )}
      </ModalDialog>
    </Modal>
  );
}
