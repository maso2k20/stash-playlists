// src/components/TemplateManager.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  FormControl,
  FormLabel,
  Input,
  Button,
  IconButton,
  Chip,
  Autocomplete,
  Modal,
  ModalDialog,
  ModalClose,
  Divider,
  Stack,
  Sheet,
  CircularProgress,
  Switch,
  Tooltip,
} from "@mui/joy";
import { Plus, Pencil, Trash2, Save } from "lucide-react";
import { useStashTags } from "@/context/StashTagsContext";

type Tag = { id: string; name: string };

type PlaylistTemplate = {
  id: string;
  name: string;
  tagIds: string[];          // Legacy
  requiredTagIds?: string[]; // ALL must match
  optionalTagIds?: string[]; // ANY must match
  excludeFromAutoGeneration: boolean; // Exclude from nightly generation
  createdAt: string;
  updatedAt: string;
};

export default function TemplateManager() {
  const { stashTags, loading: tagsLoading } = useStashTags();
  const [templates, setTemplates] = useState<PlaylistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create/Edit form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formRequiredTagIds, setFormRequiredTagIds] = useState<string[]>([]);
  const [formOptionalTagIds, setFormOptionalTagIds] = useState<string[]>([]);
  const [formExcludeFromAutoGeneration, setFormExcludeFromAutoGeneration] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Convert stash tags to the format we need
  const tagOptions: Tag[] = useMemo(
    () =>
      (stashTags || []).map((t: { id: string | number; name: string }) => ({
        id: String(t.id),
        name: String(t.name),
      })),
    [stashTags]
  );

  // Fetch templates on mount
  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/templates");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTemplates(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormName("");
    setFormRequiredTagIds([]);
    setFormOptionalTagIds([]);
    setFormExcludeFromAutoGeneration(false);
    setIsModalOpen(true);
  };

  const openEditModal = (template: PlaylistTemplate) => {
    setEditingId(template.id);
    setFormName(template.name);
    // Handle both legacy and new formats
    // Check if requiredTagIds exists (even if empty) vs undefined/null (legacy)
    const requiredTags = template.requiredTagIds !== undefined && template.requiredTagIds !== null
      ? template.requiredTagIds
      : template.tagIds; // Fallback to legacy only if new fields don't exist
    setFormRequiredTagIds(requiredTags);
    setFormOptionalTagIds(template.optionalTagIds ?? []);
    setFormExcludeFromAutoGeneration(template.excludeFromAutoGeneration ?? false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormName("");
    setFormRequiredTagIds([]);
    setFormOptionalTagIds([]);
    setFormExcludeFromAutoGeneration(false);
  };

  const handleSave = async () => {
    // Need at least a name and one tag in either group
    if (!formName.trim() || (formRequiredTagIds.length === 0 && formOptionalTagIds.length === 0)) return;

    setSaving(true);
    try {
      const url = editingId ? `/api/templates/${editingId}` : "/api/templates";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          requiredTagIds: formRequiredTagIds,
          optionalTagIds: formOptionalTagIds,
          excludeFromAutoGeneration: formExcludeFromAutoGeneration,
          // Keep legacy tagIds for backward compatibility
          tagIds: [...formRequiredTagIds, ...formOptionalTagIds],
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const saved = await res.json();

      if (editingId) {
        setTemplates((prev) =>
          prev.map((t) => (t.id === editingId ? saved : t))
        );
      } else {
        setTemplates((prev) => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)));
      }

      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/templates/${deleteId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setTemplates((prev) => prev.filter((t) => t.id !== deleteId));
      setDeleteId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete template");
    } finally {
      setDeleting(false);
    }
  };

  const getTagName = (tagId: string): string => {
    const tag = tagOptions.find((t) => t.id === tagId);
    return tag?.name || tagId;
  };

  const getSelectedRequiredTags = (): Tag[] => {
    return formRequiredTagIds
      .map((id) => tagOptions.find((t) => t.id === id))
      .filter(Boolean) as Tag[];
  };

  const getSelectedOptionalTags = (): Tag[] => {
    return formOptionalTagIds
      .map((id) => tagOptions.find((t) => t.id === id))
      .filter(Boolean) as Tag[];
  };

  // Filter out tags selected in the other group
  const availableRequiredTags = useMemo(
    () => tagOptions.filter(t => !formOptionalTagIds.includes(t.id)),
    [tagOptions, formOptionalTagIds]
  );
  const availableOptionalTags = useMemo(
    () => tagOptions.filter(t => !formRequiredTagIds.includes(t.id)),
    [tagOptions, formRequiredTagIds]
  );

  // Get display tags for a template
  const getTemplateRequiredTags = (template: PlaylistTemplate): string[] => {
    // Check if requiredTagIds exists (even if empty) vs undefined/null (legacy)
    return template.requiredTagIds !== undefined && template.requiredTagIds !== null
      ? template.requiredTagIds
      : template.tagIds; // Fallback to legacy only if new fields don't exist
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress size="sm" />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box
        sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <Typography level="title-md">Playlist Templates</Typography>
        <Button
          size="sm"
          variant="solid"
          color="primary"
          startDecorator={<Plus size={14} />}
          onClick={openCreateModal}
        >
          Add Template
        </Button>
      </Box>

      <Typography level="body-sm" sx={{ color: "text.secondary" }}>
        Define reusable tag combinations for creating actor playlists. Use Required tags for tags that MUST be present, and Optional tags for tags where at least one must match.
      </Typography>

      {error && (
        <Sheet
          variant="soft"
          color="danger"
          sx={{ p: 2, borderRadius: "md" }}
        >
          <Typography level="body-sm">{error}</Typography>
        </Sheet>
      )}

      {templates.length === 0 ? (
        <Box
          sx={{
            p: 4,
            textAlign: "center",
            border: "1px dashed",
            borderColor: "neutral.outlinedBorder",
            borderRadius: "md",
            bgcolor: "background.level1",
          }}
        >
          <Typography level="body-sm" sx={{ color: "text.secondary", mb: 2 }}>
            No templates yet. Create a template to quickly build playlists for
            any actor.
          </Typography>
          <Button
            size="sm"
            variant="outlined"
            startDecorator={<Plus size={14} />}
            onClick={openCreateModal}
          >
            Create Your First Template
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {templates.map((template) => {
            const requiredTags = getTemplateRequiredTags(template);
            const optionalTags = template.optionalTagIds ?? [];
            return (
              <Sheet
                key={template.id}
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: "md",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 2,
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <Typography level="title-sm">
                      {template.name}
                    </Typography>
                    {!template.excludeFromAutoGeneration && (
                      <Tooltip title="Included in nightly auto-generation">
                        <Chip size="sm" variant="soft" color="success" sx={{ fontSize: "0.6rem" }}>
                          Auto
                        </Chip>
                      </Tooltip>
                    )}
                  </Box>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {requiredTags.length > 0 && (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, alignItems: "center" }}>
                        <Chip size="sm" variant="soft" color="neutral" sx={{ fontSize: "0.65rem" }}>
                          ALL:
                        </Chip>
                        {requiredTags.map((tagId) => (
                          <Chip key={tagId} size="sm" variant="soft" color="primary">
                            {getTagName(tagId)}
                          </Chip>
                        ))}
                      </Box>
                    )}
                    {optionalTags.length > 0 && (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, alignItems: "center" }}>
                        <Chip size="sm" variant="soft" color="neutral" sx={{ fontSize: "0.65rem" }}>
                          ANY:
                        </Chip>
                        {optionalTags.map((tagId) => (
                          <Chip key={tagId} size="sm" variant="soft" color="success">
                            {getTagName(tagId)}
                          </Chip>
                        ))}
                      </Box>
                    )}
                  </Box>
                </Box>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <IconButton
                    size="sm"
                    variant="plain"
                    color="neutral"
                    onClick={() => openEditModal(template)}
                  >
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    variant="plain"
                    color="danger"
                    onClick={() => setDeleteId(template.id)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </Box>
              </Sheet>
            );
          })}
        </Box>
      )}

      {/* Create/Edit Modal */}
      <Modal open={isModalOpen} onClose={closeModal}>
        <ModalDialog sx={{ minWidth: 500 }}>
          <ModalClose />
          <Typography level="title-lg">
            {editingId ? "Edit Template" : "Create Template"}
          </Typography>
          <Divider />
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl required>
              <FormLabel>Template Name</FormLabel>
              <Input
                autoFocus
                placeholder='e.g., "Outdoors", "POV"'
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
              <Typography level="body-xs" sx={{ color: "neutral.500", mt: 0.5 }}>
                This becomes the playlist suffix, e.g., &quot;Actor Name {formName || "Template"}&quot;
              </Typography>
            </FormControl>

            <FormControl>
              <FormLabel sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Required Tags
                <Chip size="sm" variant="soft" color="primary" component="span">
                  ALL must match
                </Chip>
              </FormLabel>
              <Autocomplete
                multiple
                options={availableRequiredTags}
                value={getSelectedRequiredTags()}
                onChange={(_e, val) => setFormRequiredTagIds(val.map((t) => t.id))}
                getOptionLabel={(option) =>
                  typeof option === "string" ? option : option.name
                }
                isOptionEqualToValue={(a, b) => a?.id === b?.id}
                placeholder="Tags that MUST be present..."
                loading={tagsLoading}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => {
                    const { key, ...tagProps } = getTagProps({ index });
                    return (
                      <Chip key={key} {...tagProps} size="sm" color="primary">
                        {option.name}
                      </Chip>
                    );
                  })
                }
              />
              <Typography level="body-xs" sx={{ color: "neutral.500", mt: 0.5 }}>
                Markers must have ALL of these tags
              </Typography>
            </FormControl>

            <FormControl>
              <FormLabel sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Optional Tags
                <Chip size="sm" variant="soft" color="success" component="span">
                  ANY must match
                </Chip>
              </FormLabel>
              <Autocomplete
                multiple
                options={availableOptionalTags}
                value={getSelectedOptionalTags()}
                onChange={(_e, val) => setFormOptionalTagIds(val.map((t) => t.id))}
                getOptionLabel={(option) =>
                  typeof option === "string" ? option : option.name
                }
                isOptionEqualToValue={(a, b) => a?.id === b?.id}
                placeholder="At least ONE of these tags..."
                loading={tagsLoading}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => {
                    const { key, ...tagProps } = getTagProps({ index });
                    return (
                      <Chip key={key} {...tagProps} size="sm" color="success">
                        {option.name}
                      </Chip>
                    );
                  })
                }
              />
              <Typography level="body-xs" sx={{ color: "neutral.500", mt: 0.5 }}>
                Markers must have at least one of these tags (leave empty for any)
              </Typography>
            </FormControl>

            <Divider />

            <FormControl orientation="horizontal" sx={{ justifyContent: "space-between" }}>
              <Box>
                <FormLabel>Include in Auto-Generation</FormLabel>
                <Typography level="body-xs" sx={{ color: "neutral.500" }}>
                  When enabled, playlists will be automatically created for all actors using this template
                </Typography>
              </Box>
              <Switch
                checked={!formExcludeFromAutoGeneration}
                onChange={(e) => setFormExcludeFromAutoGeneration(!e.target.checked)}
                color={formExcludeFromAutoGeneration ? "neutral" : "success"}
              />
            </FormControl>
          </Stack>

          <Stack direction="row" gap={1.5} justifyContent="flex-end" sx={{ pt: 2 }}>
            <Button variant="plain" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={!formName.trim() || (formRequiredTagIds.length === 0 && formOptionalTagIds.length === 0)}
              startDecorator={<Save size={14} />}
            >
              {editingId ? "Save Changes" : "Create Template"}
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)}>
        <ModalDialog variant="outlined">
          <ModalClose />
          <Typography level="title-lg">Delete Template?</Typography>
          <Divider />
          <Typography level="body-sm" sx={{ mt: 1 }}>
            This will delete the template. Existing playlists created from this
            template will not be affected.
          </Typography>
          <Stack direction="row" gap={1.5} justifyContent="flex-end" sx={{ pt: 2 }}>
            <Button variant="plain" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button color="danger" onClick={handleDelete} loading={deleting}>
              Delete
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
