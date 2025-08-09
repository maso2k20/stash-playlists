// src/app/actors/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, gql } from "@apollo/client";
import { useParams } from "next/navigation";
import { useSettings } from "@/app/context/SettingsContext";
import { useStashTags } from "@/context/StashTagsContext";
import { formatLength } from "@/lib/formatLength";

import {
  Sheet,
  Box,
  Typography,
  Grid,
  Card,
  CardContent as JoyCardContent,
  AspectRatio,
  CardCover,
  Button,
  Chip,
  Checkbox,
  Autocomplete,
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Skeleton,
  Input,
} from "@mui/joy";

const GET_MARKERS_FOR_ACTOR = gql`
  query findActorsSceneMarkers($actorId: ID!, $tagID: [ID!]!) {
    findSceneMarkers(
      scene_marker_filter: {
        performers: { modifier: INCLUDES, value: [$actorId] }
        tags: { modifier: INCLUDES, value: $tagID }
      }
    ) {
      scene_markers {
        id
        title
        seconds
        end_seconds
        screenshot
        stream
        scene { id }
      }
    }
  }
`;

type Playlist = { id: string; name: string; type: string };

export default function Page() {
  const params = useParams<{ id: string }>();
  const actorId = params.id;

  const [selectedMarkers, setSelectedMarkers] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [playlistsError, setPlaylistsError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [chosenPlaylistId, setChosenPlaylistId] = useState<string>("");

  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [tagSearch, setTagSearch] = useState("");

  const settings = useSettings();
  const stashServer = settings["STASH_SERVER"];
  const stashAPI = settings["STASH_API"];

  const { stashTags, loading: tagsLoading, error: tagsError } = useStashTags();

  // Load playlists
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/playlists");
        if (!res.ok) throw new Error(res.statusText);
        const json = await res.json();
        setPlaylists(json ?? []);
      } catch (e: any) {
        setPlaylistsError(e.message ?? "Failed to load playlists");
      } finally {
        setPlaylistsLoading(false);
      }
    })();
  }, []);

  // Tag options
  const tagOptions = useMemo(
    () =>
      (stashTags || [])
        .filter((t: any) =>
          tagSearch ? t.name.toLowerCase().includes(tagSearch.toLowerCase()) : true
        )
        .map((t: any) => ({ id: t.id as string, label: t.name as string })),
    [stashTags, tagSearch]
  );
  const selectedTagOption =
    selectedTagId ? tagOptions.find((t: any) => t.id === selectedTagId) ?? null : null;

  // Query markers with either the chosen tag or all available tags
  const tagIDsForFilter = selectedTagId
    ? [selectedTagId]
    : (stashTags || []).map((tag: any) => tag.id);

  const { data, loading, error } = useQuery(GET_MARKERS_FOR_ACTOR, {
    variables: { actorId, tagID: tagIDsForFilter },
    fetchPolicy: "cache-and-network",
  });

  const scenes = data?.findSceneMarkers?.scene_markers ?? [];

  const toggleMarker = (markerId: string) => {
    setSelectedMarkers((prev) =>
      prev.includes(markerId) ? prev.filter((m) => m !== markerId) : [...prev, markerId]
    );
  };

  const manualPlaylists = useMemo(
    () => playlists.filter((pl) => pl.type === "MANUAL"),
    [playlists]
  );

  const confirmAdd = async () => {
    const items = selectedMarkers
      .map((mId) => {
        const marker = scenes.find((m: any) => m.id === mId);
        if (!marker) return null;
        return {
          id: marker.id,
          title: marker.title,
          startTime: marker.seconds,
          endTime: marker.end_seconds,
          screenshot: marker.screenshot,
          stream: `${stashServer}/scene/${marker.scene.id}/stream?api_key=${stashAPI}`,
        };
      })
      .filter(Boolean);

    try {
      const res = await fetch(`/api/playlists/${chosenPlaylistId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Add-to-playlist failed:", result);
      } else {
        setSelectedMarkers([]);
        setChosenPlaylistId("");
        setIsDialogOpen(false);
      }
    } catch (err) {
      console.error("Network or code error:", err);
    }
  };

  const anyLoading = loading || tagsLoading || playlistsLoading;

  return (
    <Sheet sx={{ p: 2, maxWidth: 1600, mx: "auto" }}>
      {/* Header / Actions */}
      <Box
        sx={{
          display: "flex",
          gap: 1,
          alignItems: "center",
          flexWrap: "wrap",
          mb: 2,
        }}
      >
        <Typography level="h2" sx={{ flexGrow: 1 }}>
          Scenes
        </Typography>

        {/* Selected count */}
        {selectedMarkers.length > 0 && (
          <Chip color="primary" variant="solid" size="sm">
            {selectedMarkers.length} selected
          </Chip>
        )}

        {/* Add to playlist (opens dialog) */}
        <Button
          size="sm"
          disabled={selectedMarkers.length === 0}
          onClick={() => setIsDialogOpen(true)}
        >
          Add to Playlist
        </Button>

        {/* Clear selection */}
        <Button
          size="sm"
          variant="plain"
          disabled={selectedMarkers.length === 0}
          onClick={() => setSelectedMarkers([])}
        >
          Clear
        </Button>
      </Box>

      {/* Filters row */}
      <Box
        sx={{
          display: "flex",
          gap: 1,
          alignItems: "center",
          flexWrap: "wrap",
          mb: 2,
        }}
      >
        <Autocomplete
          placeholder="Filter by tag…"
          options={tagOptions}
          value={selectedTagOption}
          onChange={(_e, val) => setSelectedTagId(val?.id ?? null)}
          getOptionLabel={(o) => (typeof o === "string" ? o : o.label)}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          size="sm"
          sx={{ minWidth: { xs: 220, sm: 300 }, flexGrow: 1 }}
          slotProps={{
            input: {
              value: tagSearch,
              onChange: (e: any) => setTagSearch(e.target.value),
            } as any,
          }}
        />
        <Button
          size="sm"
          variant="plain"
          disabled={selectedTagId === null}
          onClick={() => {
            setSelectedTagId(null);
            setTagSearch("");
          }}
        >
          Reset tag
        </Button>
      </Box>

      {/* Loading / Errors */}
      {anyLoading && (
        <Grid container spacing={2}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Grid key={i} xs={12} sm={6} md={4} lg={3} xl={2}>
              <Card sx={{ borderRadius: "lg", overflow: "hidden" }}>
                <AspectRatio ratio="16/9">
                  <Skeleton />
                </AspectRatio>
                <JoyCardContent>
                  <Skeleton variant="text" level="title-sm" />
                  <Skeleton variant="text" level="body-sm" />
                </JoyCardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {!anyLoading && (error || tagsError || playlistsError) && (
        <Typography color="danger" level="body-sm" sx={{ mb: 2 }}>
          {error?.message || tagsError || playlistsError}
        </Typography>
      )}

      {/* Empty state */}
      {!anyLoading && scenes.length === 0 && (
        <Sheet
          variant="soft"
          color="neutral"
          sx={{ p: 3, borderRadius: "lg", textAlign: "center" }}
        >
          <Typography level="title-md">No clips found.</Typography>
        </Sheet>
      )}

      {/* Scene Cards */}
      {!anyLoading && scenes.length > 0 && (
        <Grid container spacing={2}>
          {scenes.map((marker: any) => {
            const checked = selectedMarkers.includes(marker.id);
            return (
              <Grid key={marker.id} xs={12} sm={6} md={4} lg={3} xl={2}>
                <Card
                  sx={{
                    p: 0,
                    overflow: "hidden",
                    borderRadius: "lg",
                    position: "relative",
                    boxShadow: "sm",
                    transition: "transform 150ms ease, box-shadow 150ms ease",
                    "&:hover": { transform: "translateY(-2px)", boxShadow: "md" },
                  }}
                >
                  <AspectRatio ratio="16/9">
                    {/* Screenshot */}
                    <CardCover>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={marker.screenshot}
                        alt={marker.title}
                        loading="lazy"
                        style={{ objectFit: "cover" }}
                      />
                    </CardCover>

                    {/* Checkbox (top-right) */}
                    <Box sx={{ position: "absolute", top: 8, right: 8 }}>
                      <Checkbox
                        checked={checked}
                        onChange={() => toggleMarker(marker.id)}
                        size="sm"
                        variant="soft"
                      />
                    </Box>

                    {/* Bottom gradient + title/time */}
                    <Box
                      sx={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        px: 1,
                        py: 0.75,
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 80%)",
                      }}
                    >
                      <Typography
                        level="title-sm"
                        sx={{
                          color: "#fff",
                          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                        }}
                        title={marker.title}
                      >
                        {marker.title}
                      </Typography>
                      <Typography level="body-xs" sx={{ color: "#fff" }}>
                        {formatLength(marker.end_seconds - marker.seconds)}
                      </Typography>
                    </Box>
                  </AspectRatio>

                  {/* Extra content area if you want later */}
                  {/* <JoyCardContent>…</JoyCardContent> */}
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Add to Playlist Dialog */}
      <Modal open={isDialogOpen} onClose={() => setIsDialogOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <DialogTitle>Select Playlist</DialogTitle>
          <DialogContent>
            <Typography level="body-sm" sx={{ mb: 1 }}>
              Choose a manual playlist to add {selectedMarkers.length} item
              {selectedMarkers.length === 1 ? "" : "s"}.
            </Typography>

            <Autocomplete
              placeholder="Choose playlist…"
              options={manualPlaylists.map((pl) => ({ id: pl.id, label: pl.name }))}
              value={
                chosenPlaylistId
                  ? {
                      id: chosenPlaylistId,
                      label: manualPlaylists.find((p) => p.id === chosenPlaylistId)?.name ?? "",
                    }
                  : null
              }
              onChange={(_e, val) => setChosenPlaylistId(val?.id ?? "")}
              getOptionLabel={(o) => (typeof o === "string" ? o : o.label)}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              size="sm"
              sx={{ width: "100%", mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button variant="plain" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!chosenPlaylistId} onClick={confirmAdd}>
              Confirm
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </Sheet>
  );
}
