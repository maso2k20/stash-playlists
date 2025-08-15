import React, { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  Autocomplete,
  Button,
  Card,
  Chip,
  Alert,
} from '@mui/joy';
import { useStashTags } from '@/context/StashTagsContext';

interface Tag {
  id: string;
  name: string;
  children?: Tag[];
}

interface MarkerTagEditorProps {
  markerId: string;
  currentPrimaryTag?: Tag | null;
  currentTags?: Tag[];
  onSave: (markerId: string, primaryTagId: string | null, tagIds: string[]) => Promise<void>;
  loading?: boolean;
  compact?: boolean;
}

export default function MarkerTagEditor({
  markerId,
  currentPrimaryTag,
  currentTags = [],
  onSave,
  loading = false,
  compact = false,
}: MarkerTagEditorProps) {
  const { stashTags, loading: tagsLoading } = useStashTags();
  
  // Draft state
  const [draftPrimaryTagId, setDraftPrimaryTagId] = useState<string | null>(
    currentPrimaryTag?.id || null
  );
  const [draftTagIds, setDraftTagIds] = useState<string[]>(
    currentTags.map(t => t.id)
  );
  const [saving, setSaving] = useState(false);

  // Update draft state when props change
  useEffect(() => {
    setDraftPrimaryTagId(currentPrimaryTag?.id || null);
    setDraftTagIds(currentTags.map(t => t.id));
  }, [currentPrimaryTag, currentTags]);

  // Tag options from context
  const tagOptions: Tag[] = useMemo(
    () => (stashTags || []).map((t: any) => ({
      id: String(t.id),
      name: String(t.name),
      children: (t.children || []).map((c: any) => ({ id: String(c.id), name: String(c.name) }))
    })),
    [stashTags]
  );

  // Get recommended tags based on primary tag children
  const getRecommendedTags = (primaryTagId: string | null, currentTagIds: string[]): Tag[] => {
    if (!primaryTagId) return [];
    
    const primaryTag = tagOptions.find(t => t.id === primaryTagId);
    if (!primaryTag?.children) return [];
    
    // Filter out tags that are already selected
    return primaryTag.children.filter(child => 
      !currentTagIds.includes(child.id) && child.id !== primaryTagId
    );
  };

  const recommendedTags = getRecommendedTags(draftPrimaryTagId, draftTagIds);

  // Get primary tag recommendations - tags with children, for when no primary tag is selected
  const getPrimaryTagRecommendations = (): Tag[] => {
    return tagOptions.filter(tag => tag.children && tag.children.length > 0);
  };

  // Handle adding a recommended tag
  const handleAddRecommendedTag = (tagId: string) => {
    if (!draftTagIds.includes(tagId)) {
      setDraftTagIds(prev => [...prev, tagId]);
    }
  };

  // Handle selecting a primary tag from recommendations
  const handleSelectPrimaryTag = (tagId: string) => {
    setDraftPrimaryTagId(tagId);
    // Also include primary tag in the tag IDs
    if (!draftTagIds.includes(tagId)) {
      setDraftTagIds(prev => [...prev, tagId]);
    }
  };

  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    const originalPrimaryTagId = currentPrimaryTag?.id || null;
    const originalTagIds = currentTags.map(t => t.id).sort();
    const currentDraftTagIds = [...draftTagIds].sort();
    
    return draftPrimaryTagId !== originalPrimaryTagId || 
           JSON.stringify(originalTagIds) !== JSON.stringify(currentDraftTagIds);
  }, [draftPrimaryTagId, draftTagIds, currentPrimaryTag, currentTags]);

  // Normalize tag IDs (ensure primary tag is included)
  const normalizedTagIds = useMemo(() => {
    return draftPrimaryTagId 
      ? Array.from(new Set([draftPrimaryTagId, ...draftTagIds]))
      : draftTagIds;
  }, [draftPrimaryTagId, draftTagIds]);

  // Handle save
  const handleSave = async () => {
    if (!draftPrimaryTagId) {
      return; // Primary tag is required
    }

    setSaving(true);
    try {
      await onSave(markerId, draftPrimaryTagId, normalizedTagIds);
    } catch (error) {
      console.error('Failed to save marker tags:', error);
    } finally {
      setSaving(false);
    }
  };

  // Handle reset
  const handleReset = () => {
    setDraftPrimaryTagId(currentPrimaryTag?.id || null);
    setDraftTagIds(currentTags.map(t => t.id));
  };

  // Get other tags (excluding primary tag)
  const otherTagIds = draftTagIds.filter(tid => tid !== draftPrimaryTagId);

  if (tagsLoading) {
    return (
      <Card variant="soft" sx={{ p: 2 }}>
        <Typography level="body-sm">Loading tags...</Typography>
      </Card>
    );
  }

  return (
    <Card variant="soft" sx={{ p: compact ? 1 : 2 }}>
      <Typography level="title-sm" sx={{ mb: compact ? 0.5 : 1.5 }}>
        Edit Marker Tags
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: compact ? 0.75 : 1.5 }}>
        {/* Primary Tag and Additional Tags in horizontal layout for compact mode */}
        <Box sx={{ 
          display: 'flex', 
          flexDirection: compact ? 'row' : 'column', 
          gap: compact ? 2 : 1.5,
          alignItems: compact ? 'flex-start' : 'stretch'
        }}>
          {/* Primary Tag */}
          <Box sx={{ flex: compact ? '0 0 300px' : 1 }}>
            <Typography level="body-sm" sx={{ mb: 0.5, fontWeight: 500 }}>
              Primary Tag *
            </Typography>
            
            <Autocomplete
              size="sm"
              options={tagOptions}
              value={draftPrimaryTagId ? tagOptions.find(t => t.id === draftPrimaryTagId) || null : null}
              onChange={(_e, val) => setDraftPrimaryTagId(val?.id ?? null)}
              getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
              isOptionEqualToValue={(a, b) => a?.id === b?.id}
              placeholder="Select primary tag (required)"
              color={!draftPrimaryTagId ? "danger" : "neutral"}
              disabled={loading || saving}
            />
            
            {/* Primary tag recommendations - only show when no primary tag selected */}
            {!draftPrimaryTagId && (() => {
              const primaryRecommendations = getPrimaryTagRecommendations();
              return primaryRecommendations.length > 0 ? (
                <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Typography level="body-xs" sx={{ opacity: 0.8 }}>
                    Recommended:
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {primaryRecommendations.slice(0, 8).map((tag) => (
                      <Chip
                        key={tag.id}
                        size="sm"
                        variant="soft"
                        color="success"
                        onClick={() => handleSelectPrimaryTag(tag.id)}
                        sx={{
                          cursor: "pointer",
                          fontSize: "0.75rem",
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
                </Box>
              ) : null;
            })()}
          </Box>

          {/* Additional Tags with Recommended Tags */}
          <Box sx={{ flex: 1 }}>
            <Typography level="body-sm" sx={{ mb: 0.5, fontWeight: 500 }}>
              Additional Tags
            </Typography>
            <Autocomplete
              multiple
              size="sm"
              options={tagOptions.filter(t => t.id !== draftPrimaryTagId)}
              value={otherTagIds
                .map(tid => tagOptions.find(t => t.id === tid))
                .filter(Boolean) as Tag[]}
              onChange={(_e, vals) => {
                const newTagIds = Array.from(new Set([
                  ...(draftPrimaryTagId ? [draftPrimaryTagId] : []),
                  ...vals.map(v => v.id)
                ]));
                setDraftTagIds(newTagIds);
              }}
              getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
              isOptionEqualToValue={(a, b) => a?.id === b?.id}
              placeholder="Add additional tags..."
              disabled={loading || saving}
            />

            {/* Recommended Tags - aligned under Additional Tags */}
            {recommendedTags.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography level="body-xs" sx={{ mb: 0.5, fontWeight: 500, color: 'text.secondary' }}>
                  Recommended
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {recommendedTags.map(tag => (
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
              </Box>
            )}
          </Box>
        </Box>

        {/* Primary tag required warning */}
        {!draftPrimaryTagId && (
          <Alert color="danger" size="sm">
            Primary tag is required to save changes.
          </Alert>
        )}

        {/* Action Buttons */}
        <Box sx={{ 
          display: 'flex', 
          gap: 1, 
          justifyContent: 'flex-end',
          pt: compact ? 0.25 : 0.5 
        }}>
          <Button
            size="sm"
            variant="plain"
            onClick={handleReset}
            disabled={!hasChanges || loading || saving}
          >
            Reset
          </Button>
          <Button
            size="sm"
            variant="solid"
            onClick={handleSave}
            disabled={!draftPrimaryTagId || !hasChanges || loading || saving}
            loading={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </Box>
      </Box>
    </Card>
  );
}