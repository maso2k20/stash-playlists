'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import Sheet from '@mui/joy/Sheet';
import Grid from '@mui/joy/Grid';
import Box from '@mui/joy/Box';
import Stack from '@mui/joy/Stack';
import Card from '@mui/joy/Card';
import CardContent from '@mui/joy/CardContent';
import CardActions from '@mui/joy/CardActions';
import Typography from '@mui/joy/Typography';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Textarea from '@mui/joy/Textarea';
import Button from '@mui/joy/Button';
import Chip from '@mui/joy/Chip';
import Alert from '@mui/joy/Alert';
import LinearProgress from '@mui/joy/LinearProgress';
import { formatLength } from "@/lib/formatLength";
import { makeStashUrl } from "@/lib/urlUtils";

import SmartPlaylistRuleBuilder from '@/components/SmartPlaylistRuleBuilder';
import StarRating from '@/components/StarRating';
import PlaylistImageUpload from '@/components/PlaylistImageUpload';
import { useSettings } from '@/app/context/SettingsContext';
import { useStashTags } from '@/context/StashTagsContext';

// Local shape mirroring the server's SmartPlaylistConditions — kept here
// so the editor doesn't need to import a server-only type.
type Rules = {
  actorIds: string[];
  tagIds?: string[];
  requiredTagIds?: string[];
  optionalTagIds?: string[];
  minRating?: number | null;
  exactRating?: number | null;
};

// Marker shape returned by /api/smart-playlists/preview. Matches the
// fields the preview UI actually renders.
type PreviewMarker = {
  id: string;
  title?: string | null;
  seconds: number;
  end_seconds?: number | null;
  screenshot?: string | null;
  stream?: string | null;
  preview?: string | null;
  scene: {
    id: string;
    title?: string | null;
    performers?: Array<{ id: string; name: string }>;
  } | null;
  tags?: Array<{ id: string; name: string }>;
};

export default function EditAutomaticPlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/playlists';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState<Rules>({
    actorIds: [],
    tagIds: [],
    requiredTagIds: [],
    optionalTagIds: [],
    minRating: null,
    exactRating: null,
  });

  const settings = useSettings();
  const stashServer = settings['STASH_SERVER'];
  const stashAPI = settings['STASH_API'];

  const [filteredMarkers, setFilteredMarkers] = useState<PreviewMarker[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [markerRatings, setMarkerRatings] = useState<Record<string, number>>({});

  // Load playlist meta + rules
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/playlists/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error('Failed to load playlist');
        const playlist = await res.json();
        if (cancelled) return;

        setName(playlist.name || '');
        setDescription(playlist.description || '');
        setImage(playlist.image || null);
        let cond: any = {};
        if (playlist.conditions && typeof playlist.conditions === 'object') {
          cond = playlist.conditions;
        } else if (typeof playlist.conditions === 'string') {
          try {
            cond = JSON.parse(playlist.conditions);
          } catch (e) {
            console.warn('Failed to parse conditions string:', e);
          }
        }
        // Handle both legacy and new tag formats.
        // Only treat as new format when at least one array is non-empty — the API always
        // returns empty arrays for both fields even on legacy playlists, so Array.isArray
        // alone would always be true and silently discard legacy tags.
        const legacyTagIds = Array.isArray(cond.tagIds) ? cond.tagIds.map(String) : [];
        const hasNewFormat = (cond.requiredTagIds?.length ?? 0) > 0
                          || (cond.optionalTagIds?.length ?? 0) > 0;
        const requiredTagIds = hasNewFormat
          ? (Array.isArray(cond.requiredTagIds) ? cond.requiredTagIds.map(String) : [])
          : legacyTagIds; // Fallback to legacy when new format arrays are both empty
        const optionalTagIds = Array.isArray(cond.optionalTagIds)
          ? cond.optionalTagIds.map(String)
          : [];

        setRules({
          actorIds: Array.isArray(cond.actorIds) ? cond.actorIds.map(String) : [],
          tagIds: legacyTagIds,
          requiredTagIds,
          optionalTagIds,
          minRating: typeof cond.minRating === 'number' ? cond.minRating : null,
          exactRating: typeof cond.exactRating === 'number' ? cond.exactRating : null,
        });
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Stash tags for the builder UI
  const { stashTags: tags, loading: tagsLoading, error: tagsError } = useStashTags();

  // Server-side preview: single source of truth. Calls the same code path
  // the refresh button uses, so editor preview and refresh always agree.
  useEffect(() => {
    const ctrl = new AbortController();
    setPreviewLoading(true);
    setPreviewError(null);
    fetch('/api/smart-playlists/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conditions: rules }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `Preview failed (HTTP ${res.status})`);
        }
        return res.json();
      })
      .then((data: { markers: PreviewMarker[]; count: number }) => {
        setFilteredMarkers(data.markers ?? []);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        console.error('[preview]', err);
        setPreviewError(err?.message ?? 'Failed to load preview');
        setFilteredMarkers([]);
      })
      .finally(() => setPreviewLoading(false));
    return () => ctrl.abort();
  }, [rules]);

  // Fetch ratings for preview markers
  useEffect(() => {
    if (!filteredMarkers.length) {
      setMarkerRatings({});
      return;
    }
    const markerIds = filteredMarkers.slice(0, 50).map((m: any) => m.id);
    const idsParam = markerIds.join(',');
    fetch(`/api/items/ratings?ids=${encodeURIComponent(idsParam)}`)
      .then(res => res.json())
      .then(data => setMarkerRatings(data.ratings || {}))
      .catch(console.error);
  }, [filteredMarkers]);

  async function handleSave() {
    setLoading(true);
    try {
      // 1) Save name/description/image/conditions
      {
        const res = await fetch(`/api/playlists/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, image, conditions: rules }),
        });
        if (!res.ok) throw new Error('Failed to save playlist metadata.');
      }

      // 2) Trigger a server-side refresh against the just-saved conditions.
      //    allowEmpty: true tells the route this is an explicit Save — if
      //    the conditions match nothing, sync to empty rather than preserving
      //    stale items (the preserve-existing branch is for auto-refresh only).
      const res = await fetch(`/api/playlists/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: true, allowEmpty: true }),
      });

      if (!res.ok) {
        let msg = `Failed to sync playlist items (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }

      router.push(returnTo);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Failed to save playlist.');
      setLoading(false);
    }
  }

  return (
    <Sheet
      variant="outlined"
      sx={{
        mx: 'auto',
        my: 4,
        p: { xs: 2, sm: 3, md: 4 },
        borderRadius: 'lg',
        bgcolor: 'background.body',
      }}
    >
      <Box mb={2}>
        <Typography level="h3">Edit Automatic Playlist</Typography>
        <Typography level="body-sm" color="neutral">
          Define rules, preview matches, and save to update the playlist.
        </Typography>
      </Box>

      {(loading || previewLoading) && <LinearProgress thickness={2} sx={{ mb: 2 }} />}

      <Grid container spacing={3}>
        {/* Left Column: Details + Rules */}
        <Grid xs={12} lg={5}>
          <Stack spacing={3}>
            {/* Details Card */}
            <Card variant="outlined" sx={{ minHeight: 'auto' }}>
              <CardContent sx={{ p: 3 }}>
                <Typography level="title-lg" mb={2}>Details</Typography>
                <Stack direction="row" spacing={3} sx={{ alignItems: 'stretch' }}>
                  {/* Left side - Form fields */}
                  <Stack spacing={2.5} sx={{ flex: 1, display: 'flex' }}>
                    <FormControl>
                      <FormLabel>Name</FormLabel>
                      <Input
                        placeholder="Playlist name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={loading}
                        size="lg"
                      />
                    </FormControl>
                    <FormControl sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <FormLabel>Description</FormLabel>
                      <Textarea
                        placeholder="Playlist description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={loading}
                        size="lg"
                        sx={{ 
                          resize: 'vertical', 
                          flex: 1,
                          minHeight: 0
                        }}
                      />
                    </FormControl>
                  </Stack>
                  
                  {/* Right side - Cover Image */}
                  <Box sx={{ width: 200, flexShrink: 0 }}>
                    <FormControl>
                      <FormLabel>Cover Image</FormLabel>
                      <PlaylistImageUpload
                        currentImage={image ? `/api/playlist-images/${image}` : null}
                        onImageUploaded={(imageUrl, filename) => setImage(filename)}
                        onImageDeleted={() => setImage(null)}
                        playlistId={id}
                        disabled={loading}
                      />
                    </FormControl>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            {/* Rules Card */}
            <Card variant="outlined" sx={{ minHeight: 'auto', flex: 1 }}>
              <CardContent sx={{ p: 3, pb: 0 }}>
                <Typography level="title-lg" mb={2}>Rules</Typography>
                {tagsLoading && <LinearProgress thickness={2} sx={{ mb: 2 }} />}
                {tagsError && (
                  <Alert color="danger" variant="soft" sx={{ mb: 2 }}>
                    Failed to load tags.
                  </Alert>
                )}
                {!tagsLoading && !tagsError && (
                  <Box>
                    <SmartPlaylistRuleBuilder
                      tags={tags.map((t: { id: string; name: string }) => ({ id: t.id, label: t.name }))}
                      onChange={setRules}
                      initialRules={rules}
                    />
                  </Box>
                )}
              </CardContent>

              <CardActions sx={{ justifyContent: 'flex-end', p: 3, pt: 2 }}>
                <Button
                  size="lg"
                  color="primary"
                  onClick={handleSave}
                  disabled={loading || !name}
                  sx={{ minWidth: 120 }}
                >
                  {loading ? 'Saving…' : 'Save Playlist'}
                </Button>
              </CardActions>
            </Card>
          </Stack>
        </Grid>

        {/* Right Column: Enhanced Preview */}
        <Grid xs={12} lg={7}>
          <Card variant="outlined" sx={{ height: 'fit-content', minHeight: 600 }}>
            <CardContent sx={{ p: 0 }}>
              {/* Sticky Header */}
              <Box sx={{ 
                p: 3, 
                pb: 2,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.surface',
                position: 'sticky',
                top: 0,
                zIndex: 1
              }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography level="title-lg">Preview Matches</Typography>
                  <Chip 
                    size="lg" 
                    variant="soft" 
                    color={filteredMarkers.length > 0 ? "primary" : "neutral"}
                  >
                    {previewLoading ? 'Loading…' : `${filteredMarkers.length} match${filteredMarkers.length === 1 ? '' : 'es'}`}
                  </Chip>
                </Stack>
                <Typography level="body-sm" color="neutral" sx={{ mt: 0.5 }}>
                  Preview shows up to 50 results that will be included in your playlist.
                </Typography>
              </Box>

              {/* Preview Content */}
              <Box sx={{ p: 3, pt: 2 }}>
                {previewError && (
                  <Alert color="danger" variant="soft" sx={{ mb: 2 }}>
                    Failed to load preview. Please check your Stash connection.
                  </Alert>
                )}
                {!previewError && (
                  <Box>
                    {filteredMarkers.length === 0 ? (
                      <Box sx={{ 
                        textAlign: 'center', 
                        py: 8,
                        color: 'text.tertiary'
                      }}>
                        <Typography level="body-lg" sx={{ mb: 1 }}>
                          No matches found
                        </Typography>
                        <Typography level="body-sm">
                          Adjust your rules to see matching scene markers.
                        </Typography>
                      </Box>
                    ) : (
                      <Box>
                        <Stack spacing={2}>
                          {filteredMarkers.slice(0, 50).map((m: any) => {
                            const rating = markerRatings[m.id];
                            const tags = m.tags ?? [];
                            const performers = m.scene?.performers ?? [];
                            const screenshotUrl = m.screenshot ? makeStashUrl(m.screenshot, stashServer, stashAPI) : null;

                            return (
                              <Sheet
                                key={m.id}
                                variant="soft"
                                sx={{
                                  p: 2,
                                  borderRadius: 'md',
                                  transition: 'all 0.2s ease',
                                  '&:hover': {
                                    bgcolor: 'background.level1',
                                    transform: 'translateY(-1px)',
                                    boxShadow: 'sm'
                                  }
                                }}
                              >
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                  {/* Left: Image */}
                                  <Box sx={{
                                    width: 200,
                                    height: 112,
                                    flexShrink: 0,
                                    borderRadius: 'sm',
                                    overflow: 'hidden',
                                    bgcolor: 'neutral.softBg',
                                    border: '1px solid',
                                    borderColor: 'divider'
                                  }}>
                                    {screenshotUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={screenshotUrl}
                                        alt={m.title ?? 'marker'}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      />
                                    ) : <Box sx={{ width: '100%', height: '100%' }} />}
                                  </Box>

                                  {/* Right: Content */}
                                  <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    {/* Header row: Title + Rating */}
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                                      <Typography
                                        level="title-sm"
                                        sx={{
                                          fontWeight: 600,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          flex: 1
                                        }}
                                      >
                                        {m.title || 'Untitled marker'}
                                      </Typography>
                                      {rating && (
                                        <StarRating value={rating} readonly size="sm" showClearButton={false} />
                                      )}
                                    </Box>

                                    {/* Duration */}
                                    <Typography level="body-xs" color="neutral">
                                      {formatLength((Number(m.end_seconds ?? 0)) - (Number(m.seconds ?? 0)))}
                                    </Typography>

                                    {/* Performers */}
                                    {performers.length > 0 && (
                                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                        {performers.slice(0, 3).map((p: { id: string; name: string }) => (
                                          <Chip key={p.id} size="sm" variant="soft" color="primary">
                                            {p.name}
                                          </Chip>
                                        ))}
                                        {performers.length > 3 && (
                                          <Chip size="sm" variant="outlined" color="primary">
                                            +{performers.length - 3}
                                          </Chip>
                                        )}
                                      </Box>
                                    )}

                                    {/* Tags */}
                                    {tags.length > 0 && (
                                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                        {tags.slice(0, 4).map((tag: { id: string; name: string }) => (
                                          <Chip key={tag.id} size="sm" variant="soft" color="neutral">
                                            {tag.name}
                                          </Chip>
                                        ))}
                                        {tags.length > 4 && (
                                          <Chip size="sm" variant="outlined" color="neutral">
                                            +{tags.length - 4}
                                          </Chip>
                                        )}
                                      </Box>
                                    )}
                                  </Box>
                                </Box>
                              </Sheet>
                            );
                          })}
                        </Stack>
                        {filteredMarkers.length > 50 && (
                          <Box sx={{ mt: 3, textAlign: 'center' }}>
                            <Chip variant="outlined" color="neutral">
                              Showing 50 of {filteredMarkers.length} results
                            </Chip>
                          </Box>
                        )}
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Sheet>
  );
}
