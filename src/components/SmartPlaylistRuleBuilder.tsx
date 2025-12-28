import React, { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import Chip from '@mui/joy/Chip';
import Autocomplete from '@mui/joy/Autocomplete';
import Grid from '@mui/joy/Grid';
import Select from '@mui/joy/Select';
import Option from '@mui/joy/Option';

interface Actor {
  id: string;
  name: string;
}
interface Tag {
  id: string;
  label: string;
}

// New flexible rules format
interface SmartRulesOutput {
  actorIds: string[];
  tagIds?: string[];           // Legacy format (kept for backward compat)
  requiredTagIds?: string[];   // ALL must match
  optionalTagIds?: string[];   // ANY must match
  minRating?: number | null;
}

interface SmartPlaylistRuleBuilderProps {
  tags?: Tag[];
  onChange: (rules: SmartRulesOutput) => void;
  initialRules?: {
    actorIds: string[];
    tagIds?: string[];
    requiredTagIds?: string[];
    optionalTagIds?: string[];
    minRating?: number | null;
  };
}

function normalizeActors(data: any): Actor[] {
  if (Array.isArray(data)) return data as Actor[];
  if (Array.isArray(data?.actors)) return data.actors as Actor[];
  if (Array.isArray(data?.data?.actors)) return data.data.actors as Actor[];
  if (Array.isArray(data?.performers)) {
    return (data.performers as any[]).map((p) => ({ id: String(p.id), name: p.name })) as Actor[];
  }
  console.warn('[SPRB] normalize: unknown actors payload shape', data);
  return [];
}

function initializeSelections(
  initialRules: SmartPlaylistRuleBuilderProps['initialRules'],
  actors: Actor[],
  tags: Tag[],
  setSelectedActors: React.Dispatch<React.SetStateAction<Actor[]>>,
  setRequiredTags: React.Dispatch<React.SetStateAction<Tag[]>>,
  setOptionalTags: React.Dispatch<React.SetStateAction<Tag[]>>,
  setMinRating: React.Dispatch<React.SetStateAction<number | null>>,
) {
  if (!initialRules) return;

  const actorIds = (initialRules.actorIds ?? []).map(String);

  // Handle both legacy and new tag formats
  // Only fall back to legacy tagIds if requiredTagIds is not defined at all
  const legacyTagIds = (initialRules.tagIds ?? []).map(String);
  const hasNewFormat = Array.isArray(initialRules.requiredTagIds) || Array.isArray(initialRules.optionalTagIds);
  const requiredTagIds = hasNewFormat
    ? (initialRules.requiredTagIds ?? []).map(String)
    : legacyTagIds; // Fallback to legacy only if new format not present
  const optionalTagIds = (initialRules.optionalTagIds ?? []).map(String);

  if (actors.length) {
    const presetActors = actors.filter((a) => actorIds.includes(String(a.id)));
    setSelectedActors(presetActors);
  }
  if (tags.length) {
    const presetRequiredTags = tags.filter((t) => requiredTagIds.includes(String(t.id)));
    const presetOptionalTags = tags.filter((t) => optionalTagIds.includes(String(t.id)));
    setRequiredTags(presetRequiredTags);
    setOptionalTags(presetOptionalTags);
  }
  if (initialRules.minRating !== undefined) {
    setMinRating(initialRules.minRating);
  }
}

export default function SmartPlaylistRuleBuilder({
  tags = [],
  onChange,
  initialRules,
}: SmartPlaylistRuleBuilderProps) {
  const [actors, setActors] = useState<Actor[]>([]);
  const [selectedActors, setSelectedActors] = useState<Actor[]>([]);
  const [requiredTags, setRequiredTags] = useState<Tag[]>([]);
  const [optionalTags, setOptionalTags] = useState<Tag[]>([]);
  const [minRating, setMinRating] = useState<number | null>(null);

  // Track whether we've applied the initial selections
  const hasInitializedRef = useRef(false);

  // If initialRules actually changes (different IDs), allow re-initialization
  const initKey = useMemo(() => {
    const a = (initialRules?.actorIds ?? []).map(String).join(',');
    const rt = (initialRules?.requiredTagIds ?? initialRules?.tagIds ?? []).map(String).join(',');
    const ot = (initialRules?.optionalTagIds ?? []).map(String).join(',');
    const r = String(initialRules?.minRating ?? '');
    return `${a}|${rt}|${ot}|${r}`;
  }, [initialRules]);
  const lastInitKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastInitKeyRef.current !== initKey) {
      lastInitKeyRef.current = initKey;
      hasInitializedRef.current = false; // allow a fresh initialise next time inputs are ready
    }
  }, [initKey]);

  // Load actors
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/actors');
        const raw = await res.text();
        if (!res.ok) {
          console.error('[SPRB] /api/actors failed:', res.status);
          return;
        }
        let json: any;
        try {
          json = JSON.parse(raw);
        } catch (e) {
          console.error('[SPRB] JSON parse error for /api/actors:', e);
          return;
        }
        const normalized = normalizeActors(json);
        setActors(normalized);
      } catch (err) {
        console.error('[SPRB] fetch /api/actors error:', err);
      }
    })();
  }, []);

  // Initialise selections ONCE when actors + tags + initialRules are all ready.
  useEffect(() => {
    if (hasInitializedRef.current) return;
    if (!initialRules) return;            // nothing to initialise
    if (!actors.length) return;           // wait for actors
    if (!tags.length) return;             // wait for tags

    initializeSelections(initialRules, actors, tags, setSelectedActors, setRequiredTags, setOptionalTags, setMinRating);
    hasInitializedRef.current = true;
  }, [initialRules, actors, tags]);

  // Stable onChange via ref
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Bubble up when selections change.
  useEffect(() => {
    // If we're supposed to prefill from initialRules, avoid emitting
    // an early "empty" change until after init is applied.
    const shouldBubble = hasInitializedRef.current || !initialRules;
    if (!shouldBubble) return;

    const requiredTagIds = requiredTags.map((t) => String(t.id));
    const optionalTagIds = optionalTags.map((t) => String(t.id));

    onChangeRef.current({
      actorIds: selectedActors.map((a) => String(a.id)),
      requiredTagIds,
      optionalTagIds,
      // Keep legacy tagIds for backward compatibility (combine both for display purposes)
      tagIds: [...requiredTagIds, ...optionalTagIds],
      minRating,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedActors, requiredTags, optionalTags, minRating]);

  const sortedActors = useMemo(
    () => [...actors].sort((a, b) => a.name.localeCompare(b.name)),
    [actors]
  );

  // Filter out tags that are already selected in the other group
  const availableRequiredTags = useMemo(
    () => tags.filter(t => !optionalTags.some(ot => ot.id === t.id)),
    [tags, optionalTags]
  );
  const availableOptionalTags = useMemo(
    () => tags.filter(t => !requiredTags.some(rt => rt.id === t.id)),
    [tags, requiredTags]
  );

  return (
    <Box sx={{ width: '100%' }}>
      <Grid container spacing={2}>
        {/* Actors row */}
        <Grid xs={12}>
          <Box>
            <Typography level="title-sm" mb={1.5} sx={{ fontWeight: 600 }}>Actors</Typography>
            <Autocomplete
              multiple
              options={sortedActors}
              value={selectedActors}
              isOptionEqualToValue={(opt, val) => String(opt.id) === String(val.id)}
              getOptionLabel={(opt) => opt.name}
              onChange={(_, value) => setSelectedActors(value)}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => {
                  const { key, ...tagProps } = getTagProps({ index });
                  return (
                    <Chip key={`${option.id}-${index}`} {...tagProps} size="sm">
                      {option.name}
                    </Chip>
                  );
                })
              }
              placeholder="Search actors..."
              size="sm"
            />
          </Box>
        </Grid>

        {/* Required Tags (ALL must match) */}
        <Grid xs={12} sm={6}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Typography level="title-sm" sx={{ fontWeight: 600 }}>
                Required Tags
              </Typography>
              <Chip size="sm" variant="soft" color="primary">
                ALL must match
              </Chip>
            </Box>
            <Autocomplete<Tag, true, false, false>
              multiple
              options={availableRequiredTags}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(opt, val) => String(opt.id) === String(val.id)}
              value={requiredTags}
              onChange={(_, newValue) => {
                // Ensure no overlap with optional tags
                const optionalIds = new Set(optionalTags.map(t => String(t.id)));
                const filtered = newValue.filter(t => !optionalIds.has(String(t.id)));
                setRequiredTags(filtered);
              }}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => {
                  const { key, ...tagProps } = getTagProps({ index });
                  return (
                    <Chip key={`${option.id}-${index}`} {...tagProps} size="sm" color="primary">
                      {option.label}
                    </Chip>
                  );
                })
              }
              placeholder="Tags that MUST be present..."
              size="sm"
            />
            <Typography level="body-xs" sx={{ color: 'neutral.500', mt: 0.5 }}>
              Markers must have ALL of these tags
            </Typography>
          </Box>
        </Grid>

        {/* Optional Tags (ANY must match) */}
        <Grid xs={12} sm={6}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Typography level="title-sm" sx={{ fontWeight: 600 }}>
                Optional Tags
              </Typography>
              <Chip size="sm" variant="soft" color="success">
                ANY must match
              </Chip>
            </Box>
            <Autocomplete<Tag, true, false, false>
              multiple
              options={availableOptionalTags}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(opt, val) => String(opt.id) === String(val.id)}
              value={optionalTags}
              onChange={(_, newValue) => {
                // Ensure no overlap with required tags
                const requiredIds = new Set(requiredTags.map(t => String(t.id)));
                const filtered = newValue.filter(t => !requiredIds.has(String(t.id)));
                setOptionalTags(filtered);
              }}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => {
                  const { key, ...tagProps } = getTagProps({ index });
                  return (
                    <Chip key={`${option.id}-${index}`} {...tagProps} size="sm" color="success">
                      {option.label}
                    </Chip>
                  );
                })
              }
              placeholder="At least ONE of these tags..."
              size="sm"
            />
            <Typography level="body-xs" sx={{ color: 'neutral.500', mt: 0.5 }}>
              Markers must have at least one of these tags (leave empty for any)
            </Typography>
          </Box>
        </Grid>

        {/* Rating in bottom row, full width */}
        <Grid xs={12}>
          <Box sx={{ mt: 1 }}>
            <Typography level="title-sm" mb={1.5} sx={{ fontWeight: 600 }}>Minimum Rating</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Select
                value={minRating}
                onChange={(_, value) => setMinRating(value)}
                placeholder="Any rating"
                size="sm"
                sx={{ maxWidth: 200 }}
              >
                <Option value={null}>Any rating</Option>
                <Option value={1}>1+ stars</Option>
                <Option value={2}>2+ stars</Option>
                <Option value={3}>3+ stars</Option>
                <Option value={4}>4+ stars</Option>
                <Option value={5}>5 stars only</Option>
              </Select>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
