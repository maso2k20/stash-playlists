import React, { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import Chip from '@mui/joy/Chip';
import Autocomplete from '@mui/joy/Autocomplete';
import Grid from '@mui/joy/Grid';
import Select from '@mui/joy/Select';
import Option from '@mui/joy/Option';
import StarRating from './StarRating';

interface Actor {
  id: string;
  name: string;
}
interface Tag {
  id: string;
  label: string;
}
interface SmartPlaylistRuleBuilderProps {
  tags?: Tag[];
  onChange: (rules: { actorIds: string[]; tagIds: string[]; minRating?: number | null }) => void;
  initialRules?: { actorIds: string[]; tagIds: string[]; minRating?: number | null };
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
  initialRules: { actorIds: string[]; tagIds: string[]; minRating?: number | null } | undefined,
  actors: Actor[],
  tags: Tag[],
  setSelectedActors: React.Dispatch<React.SetStateAction<Actor[]>>,
  setSelectedTags: React.Dispatch<React.SetStateAction<Tag[]>>,
  setMinRating: React.Dispatch<React.SetStateAction<number | null>>,
) {
  if (!initialRules) return;

  const actorIds = (initialRules.actorIds ?? []).map(String);
  const tagIds = (initialRules.tagIds ?? []).map(String);

  if (actors.length) {
    const presetActors = actors.filter((a) => actorIds.includes(String(a.id)));
    setSelectedActors(presetActors);
  }
  if (tags.length) {
    const presetTags = tags.filter((t) => tagIds.includes(String(t.id)));
    setSelectedTags(presetTags);
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
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [minRating, setMinRating] = useState<number | null>(null);

  // Track whether we've applied the initial selections
  const hasInitializedRef = useRef(false);

  // If initialRules actually changes (different IDs), allow re-initialization
  const initKey = useMemo(() => {
    const a = (initialRules?.actorIds ?? []).map(String).join(',');
    const t = (initialRules?.tagIds ?? []).map(String).join(',');
    const r = String(initialRules?.minRating ?? '');
    return `${a}|${t}|${r}`;
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

    initializeSelections(initialRules, actors, tags, setSelectedActors, setSelectedTags, setMinRating);
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

    onChangeRef.current({
      actorIds: selectedActors.map((a) => String(a.id)),
      tagIds: selectedTags.map((t) => String(t.id)),
      minRating,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedActors, selectedTags, minRating]);

  const sortedActors = useMemo(
    () => [...actors].sort((a, b) => a.name.localeCompare(b.name)),
    [actors]
  );

  return (
    <Grid container spacing={3} sx={{ width: '100%' }}>
      <Grid xs={12} md={4}>
        <Box>
          <Typography level="title-md" mb={1}>Actors</Typography>
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
                  <Chip key={`${option.id}-${index}`} {...tagProps}>
                    {option.name}
                  </Chip>
                );
              })
            }
            placeholder="Search actors..."
          />
        </Box>
      </Grid>

      <Grid xs={12} md={4}>
        <Box>
          <Typography level="title-md" mb={1}>Tags</Typography>
          <Autocomplete<Tag, true, false, false>
            multiple
            options={tags}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(opt, val) => String(opt.id) === String(val.id)}
            value={selectedTags}
            onChange={(_, newValue) => setSelectedTags(newValue)}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => {
                const { key, ...tagProps } = getTagProps({ index });
                return (
                  <Chip key={`${option.id}-${index}`} {...tagProps}>
                    {option.label}
                  </Chip>
                );
              })
            }
            placeholder="Search tags..."
          />
        </Box>
      </Grid>

      <Grid xs={12} md={4}>
        <Box>
          <Typography level="title-md" mb={1}>Minimum Rating</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Select
              value={minRating}
              onChange={(_, value) => setMinRating(value)}
              placeholder="Any rating"
              size="md"
            >
              <Option value={null}>Any rating</Option>
              <Option value={1}>1+ stars</Option>
              <Option value={2}>2+ stars</Option>
              <Option value={3}>3+ stars</Option>
              <Option value={4}>4+ stars</Option>
              <Option value={5}>5 stars only</Option>
            </Select>
            
            {minRating && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <Typography level="body-sm" color="neutral">
                  Preview:
                </Typography>
                <StarRating value={minRating} readonly size="sm" showClearButton={false} />
                <Typography level="body-sm" color="neutral">
                  and higher
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Grid>
    </Grid>
  );
}
