'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import SmartPlaylistRuleBuilder from '@/components/SmartPlaylistRuleBuilder';
import { useStashTags } from '@/context/StashTagsContext';
import { gql, useLazyQuery } from '@apollo/client';

// GraphQL query to fetch matching scene markers based on rules
const SMART_PLAYLIST_BUILDER = gql`
  query smartPlaylistBuilder($actorId: [ID!], $tagID: [ID!]!) {
    findSceneMarkers(
      filter: { per_page: 5000 }
      scene_marker_filter: {
        performers: { modifier: INCLUDES_ALL, value: $actorId }
        tags: { modifier: INCLUDES_ALL, value: $tagID }
      }
    ) {
      scene_markers {
        id
        title
        end_seconds
        seconds
        screenshot
        stream
      }
    }
  }
`;

export default function EditAutomaticPlaylistPage() {
  const { id } = useParams();
  const router = useRouter();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState<{ actorIds: string[]; tagIds: string[] }>({
    actorIds: [],
    tagIds: []
  });

  // Apollo lazy query for preview
  const [fetchMarkers, { data: previewData, loading: previewLoading, error: previewError }] =
    useLazyQuery(SMART_PLAYLIST_BUILDER);

  // Fetch playlist details (including saved conditions JSON)
  useEffect(() => {
    async function fetchPlaylist() {
      setLoading(true);
      const res = await fetch(`/api/playlists/${id}`);
      if (res.ok) {
        const playlist = await res.json();
        setName(playlist.name || '');
        setDescription(playlist.description || '');
        try {
          const cond = playlist.conditions ? JSON.parse(playlist.conditions) : {};
          setRules({
            actorIds: Array.isArray(cond.actorIds) ? cond.actorIds : [],
            tagIds:   Array.isArray(cond.tagIds)   ? cond.tagIds   : []
          });
        } catch (e) {
          console.error('Invalid conditions JSON', e);
        }
      } else {
        console.error('Failed to load playlist');
      }
      setLoading(false);
    }
    fetchPlaylist();
  }, [id]);

  // Tags from context
  const { stashTags: tags, loading: tagsLoading, error: tagsError } = useStashTags();

  // Trigger preview query when rules change
  useEffect(() => {
    fetchMarkers({ variables: { actorId: rules.actorIds, tagID: rules.tagIds } });
  }, [rules, fetchMarkers]);

  // Save updated name/description/conditions
  async function handleSave() {
    setLoading(true);
    const body = {
      name,
      description,
      conditions: JSON.stringify(rules)
    };
    console.debug('Debug Save Payload:', body);

    const res = await fetch(`/api/playlists/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      setLoading(false);
      alert('Failed to save playlist metadata.');
      return;
    }

    // Clear existing playlist items
    try {
      // Fetch current items
      const existingRes = await fetch(`/api/playlists/${id}/items`);
      if (existingRes.ok) {
        const existingData = await existingRes.json();
        const existingItems = existingData.items || [];
        for (const it of existingItems) {
          await fetch(`/api/playlists/${id}/items`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: it.id }),
          });
        }
      }
    } catch (clearErr) {
      console.error('Error clearing existing items:', clearErr);
    }
    
    // Upsert matching items into playlist
    try {
      const itemsPayload = markers.map((m: { id: any; title: any; seconds: any; end_seconds: any; screenshot: any; stream: any; }) => ({
        id: m.id,
        title: m.title,
        startTime: m.seconds,
        endTime: m.end_seconds,
        screenshot: m.screenshot,
        stream: m.stream
      }));
      console.debug('Upserting items:', itemsPayload);
      const itemsRes = await fetch(`/api/playlists/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsPayload })
      });
      if (!itemsRes.ok) console.error('Failed to upsert playlist items');
    } catch (e) {
      console.error('Error upserting items:', e);
    }

    setLoading(false);
    router.push('/playlists');
    
  }

  const markers = previewData?.findSceneMarkers.scene_markers || [];

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Edit Automatic Playlist</h1>

      {/* Name Section */}
      <div className="mb-6">
        <Label htmlFor="playlist-name" className="block mb-1">Name</Label>
        <Input
          id="playlist-name"
          placeholder="Playlist name"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={loading}
        />
      </div>

      {/* Description Section */}
      <div className="mb-6">
        <Label htmlFor="playlist-description" className="block mb-1">Description</Label>
        <Input
          id="playlist-description"
          placeholder="Playlist description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          disabled={loading}
        />
      </div>

      {/* Rules Section */}
      <div className="mb-6">
        <Label className="block mb-1">Rules</Label>
        {tagsLoading ? (
          <p>Loading tags...</p>
        ) : tagsError ? (
          <p className="text-red-500">Failed to load tags</p>
        ) : (
          <div className="h-140 overflow-auto border rounded-lg p-2">
            <SmartPlaylistRuleBuilder
              tags={tags.map((t: { id: any; name: any; }) => ({ id: t.id, label: t.name }))}
              onChange={setRules}
              initialRules={rules}
            />
          </div>
        )}
      </div>

      {/* Preview Section */}
      <div className="mb-6">
        <Label className="block mb-1">Preview Matches</Label>
        {previewLoading ? (
          <p>Loading preview...</p>
        ) : previewError ? (
          <p className="text-red-500">Failed to load preview</p>
        ) : (
          <p>{markers.length} scene marker{markers.length === 1 ? '' : 's'} match these rules.</p>
        )}
      </div>

      {/* Save Button */}
      <div className="text-right">
        <Button onClick={handleSave} disabled={loading || !name}>
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
