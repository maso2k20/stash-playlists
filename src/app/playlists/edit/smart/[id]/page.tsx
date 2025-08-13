// filepath: src/app/test/playlist/[id]/EditAutomaticPlaylistPage.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLazyQuery } from '@apollo/client';

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

import SmartPlaylistRuleBuilder from '@/components/SmartPlaylistRuleBuilder';
import { useSettings } from '@/app/context/SettingsContext';
import { useStashTags } from '@/context/StashTagsContext';

// 🔁 Shared query + helpers used by both editor and refresh API
import {
  SMART_PLAYLIST_BUILDER,
  buildSmartVars,
  mapMarkersToItems,
  type SmartRules as Rules,
} from '@/shared/smartPlaylistQuery';

export default function EditAutomaticPlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState<Rules>({ actorIds: [], tagIds: [], minRating: null });

  const settings = useSettings();
  const stashServer = settings['STASH_SERVER'];
  const stashAPI = settings['STASH_API'];

  const [fetchMarkers, { data: previewData, loading: previewLoading, error: previewError }] =
    useLazyQuery(SMART_PLAYLIST_BUILDER, { fetchPolicy: "no-cache" });

  const [filteredMarkers, setFilteredMarkers] = useState<any[]>([]);
  const [filteringLoading, setFilteringLoading] = useState(false);

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
        setRules({
          actorIds: Array.isArray(cond.actorIds) ? cond.actorIds.map(String) : [],
          tagIds: Array.isArray(cond.tagIds) ? cond.tagIds.map(String) : [],
          minRating: typeof cond.minRating === 'number' ? cond.minRating : null,
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

  // Preview query (reuses shared var builder)
  useEffect(() => {
    fetchMarkers({ variables: buildSmartVars(rules) });
  }, [rules, fetchMarkers]);

  const rawMarkers = useMemo(
    () => previewData?.findSceneMarkers?.scene_markers ?? [],
    [previewData]
  );

  // Apply rating filter to preview results
  useEffect(() => {
    if (!rawMarkers.length) {
      setFilteredMarkers([]);
      return;
    }

    (async () => {
      setFilteringLoading(true);
      try {
        // Convert markers to items format for filtering
        const items = mapMarkersToItems(rawMarkers, { stashServer, stashAPI });
        
        // Apply rating filter if specified
        let filteredItems = items;
        if (rules.minRating && rules.minRating >= 1) {
          const response = await fetch('/api/items/filter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              itemIds: items.map(item => item.id),
              minRating: rules.minRating 
            }),
          });
          
          if (response.ok) {
            const { filteredIds } = await response.json();
            const filteredIdSet = new Set(filteredIds);
            filteredItems = items.filter(item => filteredIdSet.has(item.id));
          }
        }

        // Convert back to marker format for display
        const filteredMarkerIds = new Set(filteredItems.map(item => item.id));
        setFilteredMarkers(rawMarkers.filter((marker: any) => filteredMarkerIds.has(marker.id)));
      } catch (error) {
        console.error('Error filtering markers by rating:', error);
        setFilteredMarkers(rawMarkers); // Fallback to unfiltered
      } finally {
        setFilteringLoading(false);
      }
    })();
  }, [rawMarkers, rules.minRating, stashServer, stashAPI]);

  async function handleSave() {
    setLoading(true);
    try {
      // 1) Save metadata + conditions
      {
        const res = await fetch(`/api/playlists/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, conditions: rules }),
        });
        if (!res.ok) throw new Error('Failed to save playlist metadata.');
      }

      // 2) If no markers, do NOT sync items — avoid accidental clears
      if (!filteredMarkers || filteredMarkers.length === 0) {
        setLoading(false);
        alert('No matches found. Saved name/description/rules, but did not update playlist items.');
        return;
      }

      // 3) Prepare payload using shared mapper (keeps parity with refresh)
      const itemsPayload = mapMarkersToItems(filteredMarkers, {
        stashServer,
        stashAPI,
      });

      // 4) Sync
      const res = await fetch(`/api/playlists/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsPayload }),
      });

      if (!res.ok) {
        let msg = `Failed to sync playlist items (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }

      router.push('/playlists');
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

      {(loading || previewLoading || filteringLoading) && <LinearProgress thickness={2} sx={{ mb: 2 }} />}

      <Grid container spacing={3}>
        {/* Left Column: Details + Rules */}
        <Grid xs={12} lg={5}>
          <Stack spacing={3}>
            {/* Details Card */}
            <Card variant="outlined" sx={{ minHeight: 'auto' }}>
              <CardContent sx={{ p: 3 }}>
                <Typography level="title-lg" mb={2}>Details</Typography>
                <Stack spacing={2.5}>
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
                  <FormControl>
                    <FormLabel>Description</FormLabel>
                    <Textarea
                      minRows={4}
                      placeholder="Playlist description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={loading}
                      size="lg"
                    />
                  </FormControl>
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
                    {(previewLoading || filteringLoading) ? 'Loading…' : `${filteredMarkers.length} match${filteredMarkers.length === 1 ? '' : 'es'}`}
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
                        <Grid container spacing={2}>
                          {filteredMarkers.slice(0, 50).map((m: any) => (
                            <Grid xs={12} sm={6} key={m.id}>
                              <Sheet
                                variant="soft"
                                sx={{
                                  p: 2,
                                  borderRadius: 'md',
                                  display: 'grid',
                                  gridTemplateColumns: '100px 1fr',
                                  gap: 2,
                                  alignItems: 'center',
                                  transition: 'all 0.2s ease',
                                  '&:hover': {
                                    bgcolor: 'background.level1',
                                    transform: 'translateY(-1px)',
                                    boxShadow: 'sm'
                                  }
                                }}
                              >
                                <Box sx={{ 
                                  width: 100, 
                                  height: 56, 
                                  borderRadius: 'sm', 
                                  overflow: 'hidden', 
                                  bgcolor: 'neutral.softBg',
                                  border: '1px solid',
                                  borderColor: 'divider'
                                }}>
                                  {m.screenshot ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={m.screenshot}
                                      alt={m.title ?? 'marker'}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                  ) : <Box sx={{ width: '100%', height: '100%' }} />}
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography 
                                    level="body-md" 
                                    sx={{ 
                                      fontWeight: 600,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    {m.title || 'Untitled marker'}
                                  </Typography>
                                  <Typography level="body-sm" color="neutral">
                                    {formatLength((Number(m.end_seconds ?? 0)) - (Number(m.seconds ?? 0)))}
                                  </Typography>
                                </Box>
                              </Sheet>
                            </Grid>
                          ))}
                        </Grid>
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
