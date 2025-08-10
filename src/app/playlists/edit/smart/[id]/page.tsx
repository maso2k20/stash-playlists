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
import Divider from '@mui/joy/Divider';
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
  const [rules, setRules] = useState<Rules>({ actorIds: [], tagIds: [] });

  const settings = useSettings();
  const stashServer = settings['STASH_SERVER'];
  const stashAPI = settings['STASH_API'];

  const [fetchMarkers, { data: previewData, loading: previewLoading, error: previewError }] =
    useLazyQuery(SMART_PLAYLIST_BUILDER, { fetchPolicy: "no-cache" });

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

  const markers = useMemo(
    () => previewData?.findSceneMarkers?.scene_markers ?? [],
    [previewData]
  );

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
      if (!markers || markers.length === 0) {
        setLoading(false);
        alert('No matches found. Saved name/description/rules, but did not update playlist items.');
        return;
      }

      // 3) Prepare payload using shared mapper (keeps parity with refresh)
      const itemsPayload = mapMarkersToItems(markers, {
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
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography level="h3">Edit Automatic Playlist</Typography>
          <Typography level="body-sm" color="neutral">
            Define rules, preview matches, and save to update the playlist.
          </Typography>
        </Box>
        <Chip size="lg" variant="soft" color="primary">
          {previewLoading ? 'Loading…' : `${markers.length} match${markers.length === 1 ? '' : 'es'}`}
        </Chip>
      </Stack>

      {(loading || previewLoading) && <LinearProgress thickness={2} sx={{ mb: 2 }} />}

      <Grid container spacing={2}>
        {/* Left: Details */}
        <Grid xs={12} md={4}>
          <Card variant="outlined" sx={{ height: 300 }}>
            <CardContent>
              <Typography level="title-lg" mb={1}>Details</Typography>
              <Stack spacing={2}>
                <FormControl>
                  <FormLabel>Name</FormLabel>
                  <Input
                    placeholder="Playlist name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Description</FormLabel>
                  <Textarea
                    minRows={5}
                    placeholder="Playlist description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={loading}
                  />
                </FormControl>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Middle: Rules */}
        <Grid xs={12} md={4}>
          <Card variant="outlined" sx={{ height: 300 }}>
            <CardContent>
              <Typography level="title-lg" mb={1}>Rules</Typography>
              {tagsLoading && <LinearProgress thickness={2} />}
              {tagsError && (
                <Alert color="danger" variant="soft" sx={{ mt: 1 }}>
                  Failed to load tags.
                </Alert>
              )}
              {!tagsLoading && !tagsError && (
                <Box sx={{ mt: 1 }}>
                  <SmartPlaylistRuleBuilder
                    tags={tags.map((t: { id: string; name: string }) => ({ id: t.id, label: t.name }))}
                    onChange={setRules}
                    initialRules={rules}
                  />
                </Box>
              )}
            </CardContent>

            <CardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
              <Button
                size="lg"
                color="primary"
                onClick={handleSave}
                disabled={loading || !name}
              >
                {loading ? 'Saving…' : 'Save'}
              </Button>
            </CardActions>
          </Card>
        </Grid>

        {/* Right: Preview */}
        <Grid xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography level="title-lg" mb={1}>Preview Matches</Typography>
              {previewError && (
                <Alert color="danger" variant="soft" sx={{ mb: 1 }}>
                  Failed to load preview.
                </Alert>
              )}
              {!previewError && (
                <Stack spacing={1}>
                  <Typography level="body-sm" color="neutral">
                    {markers.length} scene marker{markers.length === 1 ? '' : 's'} match these rules.
                  </Typography>
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ maxHeight: 900, overflow: 'auto', pr: 0.5 }}>
                    {markers.length === 0 ? (
                      <Typography level="body-sm" color="neutral">
                        No matches yet. Adjust your rules to see results.
                      </Typography>
                    ) : (
                      <Stack spacing={1}>
                        {markers.slice(0, 50).map((m: any) => (
                          <Sheet
                            key={m.id}
                            variant="soft"
                            sx={{
                              p: 1,
                              borderRadius: 'md',
                              display: 'grid',
                              gridTemplateColumns: '80px 1fr',
                              gap: 1,
                              alignItems: 'center',
                            }}
                          >
                            <Box sx={{ width: 80, height: 45, borderRadius: 'sm', overflow: 'hidden', bgcolor: 'neutral.softBg' }}>
                              {m.screenshot ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={m.screenshot}
                                  alt={m.title ?? 'marker'}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : <Box sx={{ width: '100%', height: '100%' }} />}
                            </Box>
                            <Box>
                              <Typography level="body-md" sx={{ fontWeight: 600 }}>
                                {m.title || 'Untitled marker'}
                              </Typography>
                              <Typography level="body-sm" color="neutral">
                                {formatLength((Number(m.end_seconds ?? 0)) - (Number(m.seconds ?? 0)))}
                              </Typography>
                            </Box>
                          </Sheet>
                        ))}
                        {markers.length > 50 && (
                          <Typography level="body-sm" color="neutral">
                            Showing 50 of {markers.length} results…
                          </Typography>
                        )}
                      </Stack>
                    )}
                  </Box>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Sheet>
  );
}
