// filepath: src/app/scenes/[id]/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, gql } from "@apollo/client";
import {
    Container,
    Sheet,
    Box,
    Typography,
    Card,
    Chip,
    Divider,
    Skeleton,
    Input,
    Button,
    Autocomplete,
    Checkbox,
    Grid,
    IconButton,
    Tooltip,
    Modal,
    ModalDialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from "@mui/joy";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useStashTags } from "@/context/StashTagsContext";
import { useSettings } from "@/app/context/SettingsContext";
import VideoJS from "@/components/videojs/VideoJS";
import TimeInput from "@/components/TimeInput";
import StarRating from "@/components/StarRating";

/* Query: scene with markers + tags */
const GET_SCENE_FOR_TAG_MANAGEMENT = gql`
  query getSceneForTagManagement($id: ID!) {
    findScene(id: $id) {
      id
      title
      paths { screenshot vtt }
      tags { id name }
      scene_markers {
        id
        title
        seconds
        end_seconds
        primary_tag { id name }
        tags { id name }
      }
      performers {
        id
        name
        tags {
          id
          name
        }
      }
    }
  }
`;

/* Mutations */
const UPDATE_SCENE_MARKER = gql`
  mutation updateSceneMarker($input: SceneMarkerUpdateInput!) {
    sceneMarkerUpdate(input: $input) {
      id
      title
      seconds
      end_seconds
      primary_tag { id name }
      tags { id name }
    }
  }
`;

const CREATE_SCENE_MARKER = gql`
  mutation createSceneMarker($input: SceneMarkerCreateInput!) {
    sceneMarkerCreate(input: $input) {
      id
      title
      seconds
      end_seconds
      primary_tag { id name }
      tags { id name }
    }
  }
`;

const DELETE_SCENE_MARKER = gql`
  mutation deleteSceneMarker($id: ID!) {
    sceneMarkerDestroy(id: $id)
  }
`;

const UPDATE_SCENE = gql`
  mutation updateScene($input: SceneUpdateInput!) {
    sceneUpdate(input: $input) {
      id
      tags { id name }
    }
  }
`;

type Tag = { id: string; name: string; children?: Tag[] };
type Marker = {
    id: string;
    title: string;
    seconds: number;
    end_seconds: number | null;
    primary_tag?: Tag | null;
    tags?: Tag[];
};
type Draft = {
    title: string;
    seconds: number;
    end_seconds: number | null;
    primary_tag_id: string | null;
    tag_ids: string[];
};

function joinUrl(base?: string, path?: string) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    if (!base) return path;
    return `${base.replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

function withApiKey(url: string, apiKey?: string) {
    if (!url || !apiKey) return url;
    return /[?&]api_key=/.test(url) ? url : `${url}${url.includes("?") ? "&" : "?"}api_key=${apiKey}`;
}

export default function SceneTagManagerPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const sceneId = params.id;

    const { data, loading, error, refetch } = useQuery(GET_SCENE_FOR_TAG_MANAGEMENT, {
        variables: { id: sceneId },
        fetchPolicy: "cache-and-network",
    });

    const [updateSceneMarker] = useMutation(UPDATE_SCENE_MARKER);
    const [createSceneMarker] = useMutation(CREATE_SCENE_MARKER);
    const [deleteSceneMarker] = useMutation(DELETE_SCENE_MARKER);
    const [updateScene] = useMutation(UPDATE_SCENE);

    const scene = data?.findScene;
    const markers: Marker[] = (scene?.scene_markers ?? []) as any;

    // Tag options from context
    const { stashTags, loading: tagsLoading, refetch: refetchTags } = useStashTags();
    const tagOptions: Tag[] = useMemo(
        () => (stashTags || []).map((t: any) => ({
            id: String(t.id),
            name: String(t.name),
            children: (t.children || []).map((c: any) => ({ id: String(c.id), name: String(c.name) }))
        })),
        [stashTags]
    );

    // Performer tags - collect and deduplicate all tags from scene performers
    const performerTags: Tag[] = useMemo(() => {
        if (!scene?.performers) {
            console.log('No performers in scene');
            return [];
        }
        console.log('Processing performers:', scene.performers);
        const allTags = scene.performers.flatMap((p: any) => {
            console.log('Performer:', p.name, 'tags:', p.tags);
            return (p.tags || []) as Tag[];
        });
        console.log('All tags before dedup:', allTags);
        const dedupedTags = Array.from(new Map(allTags.map((t: Tag) => [t.id, t])).values()) as Tag[];
        console.log('Deduped tags:', dedupedTags);
        return dedupedTags;
    }, [scene?.performers]);

    // Settings for stream URL
    const settings = useSettings();
    const stashServer = String(settings["STASH_SERVER"] || "").replace(/\/+$/, "");
    const stashAPI = String(settings["STASH_API"] || "");
    // Stabilize streamUrl and posterUrl to prevent video jumping on marker updates
    const streamUrl = useMemo(() => {
        return sceneId ? `${stashServer}/scene/${sceneId}/stream?api_key=${stashAPI}` : "";
    }, [sceneId, stashServer, stashAPI]);

    const posterUrl = useMemo(() => {
        const raw = scene?.paths?.screenshot || "";
        if (!raw) return undefined;
        const abs = joinUrl(stashServer, raw);
        const withKey = withApiKey(abs, stashAPI);
        return withKey || undefined; // undefined avoids a broken img if empty
    }, [scene?.paths?.screenshot, stashServer, stashAPI]);

    // ----- State -----
    // Drafts for BOTH server markers and new temporary rows (by id)
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [savingAll, setSavingAll] = useState(false);

    // New (unsaved) marker ids; their ids are "tmp_..."
    const [newIds, setNewIds] = useState<string[]>([]);

    // Common Tags state
    const [commonTagIds, setCommonTagIds] = useState<string[]>([]);
    const [removeCommonMode, setRemoveCommonMode] = useState<boolean>(false);

    // Performer Tags state
    const [selectedPerformerTagIds, setSelectedPerformerTagIds] = useState<string[]>([]);
    const [removePerformerMode, setRemovePerformerMode] = useState<boolean>(false);

    // VideoJS refs
    const playerRef = useRef<any>(null);
    const [playerReady, setPlayerReady] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);

    // Active marker tracking
    const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

    // Delete confirmation dialog
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [markerToDelete, setMarkerToDelete] = useState<{ id: string; title: string } | null>(null);

    // Ratings state
    const [ratings, setRatings] = useState<Record<string, number | null>>({});
    const [loadingRating, setLoadingRating] = useState<string | null>(null);

    // Back navigation logic
    const [referrer, setReferrer] = useState<string | null>(null);

    useEffect(() => {
        // Check if we came from an actors page
        if (document.referrer) {
            const referrerUrl = new URL(document.referrer);
            const referrerPath = referrerUrl.pathname;

            // Check if referrer is an actors page
            if (referrerPath.startsWith('/actors/') && !referrerPath.includes('/scenes')) {
                setReferrer(document.referrer);
            }
        }
    }, []);

    // Handle back navigation
    const handleGoBack = () => {
        if (referrer) {
            router.push(referrer);
        } else {
            router.back();
        }
    };

    // Init drafts from server markers
    useEffect(() => {
        const next: Record<string, Draft> = {};
        for (const m of markers) {
            const markerTagIds = (m.tags || []).map((t) => t.id);
            const normalizedMarkerTagIds = m.primary_tag?.id
                ? Array.from(new Set([m.primary_tag.id, ...markerTagIds]))
                : markerTagIds;

            next[m.id] = {
                title: m.title || "",
                seconds: Number(m.seconds || 0),
                end_seconds: m.end_seconds != null ? Number(m.end_seconds) : null,
                primary_tag_id: m.primary_tag?.id ?? null,
                tag_ids: normalizedMarkerTagIds,
            };
        }
        setDrafts((prev) => {
            // keep any existing tmp drafts, overwrite server ids
            const keepTmp: Record<string, Draft> = {};
            for (const id of Object.keys(prev)) {
                if (id.startsWith("tmp_")) keepTmp[id] = prev[id];
            }
            return { ...keepTmp, ...next };
        });
    }, [markers.length]);

    // Load ratings for existing markers
    useEffect(() => {
        const loadRatings = async () => {
            const ratingsMap: Record<string, number | null> = {};
            for (const marker of markers) {
                try {
                    const response = await fetch(`/api/items/${marker.id}/rating`);
                    if (response.ok) {
                        const data = await response.json();
                        ratingsMap[marker.id] = data.item.rating;
                    } else if (response.status === 404) {
                        // Item doesn't exist yet, set rating as null (unrated)
                        ratingsMap[marker.id] = null;
                    }
                } catch (error) {
                    console.error(`Failed to load rating for marker ${marker.id}:`, error);
                    // Set as null on error too
                    ratingsMap[marker.id] = null;
                }
            }
            setRatings(ratingsMap);
        };

        if (markers.length > 0) {
            loadRatings();
        }
    }, [markers]);

    // Initialize performer tags when performer data loads
    useEffect(() => {
        console.log('Scene performers:', scene?.performers);
        console.log('Performer tags:', performerTags);
        setSelectedPerformerTagIds(performerTags.map(t => t.id));
    }, [performerTags, scene?.performers]);

    // Keyboard shortcuts for video navigation
    useEffect(() => {
        const handleKeyDown = (event) => {
            // Only activate when not typing in input fields
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            const player = playerRef.current;
            if (!player || !playerReady) return;

            let handled = false;
            const currentTime = player.currentTime();

            switch (event.code) {
                case 'ArrowLeft':
                    // Go back 5 seconds
                    player.currentTime(Math.max(0, currentTime - 5));
                    handled = true;
                    break;
                case 'ArrowRight':
                    // Go forward 5 seconds
                    const duration = player.duration() || 0;
                    player.currentTime(Math.min(duration, currentTime + 5));
                    handled = true;
                    break;
                case 'KeyJ':
                    // YouTube-style: J = back 10 seconds
                    player.currentTime(Math.max(0, currentTime - 10));
                    handled = true;
                    break;
                case 'KeyL':
                    // YouTube-style: L = forward 10 seconds
                    const dur = player.duration() || 0;
                    player.currentTime(Math.min(dur, currentTime + 10));
                    handled = true;
                    break;
            }

            if (handled) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [playerReady]);


    const setDraft = (id: string, patch: Partial<Draft>) =>
        setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || ({} as Draft)), ...patch } }));

    // Handle rating updates
    const handleRatingChange = async (markerId: string, rating: number | null) => {
        if (isTemp(markerId)) {
            // For temporary markers, we can't save ratings yet
            return;
        }

        setLoadingRating(markerId);
        try {
            const response = await fetch(`/api/items/${markerId}/rating`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ rating }),
            });

            if (response.ok) {
                setRatings(prev => ({
                    ...prev,
                    [markerId]: rating,
                }));
            } else {
                const errorText = await response.text();
                console.error('Failed to update rating:', response.status, errorText);

                // If item doesn't exist (404), create it first
                if (response.status === 404) {
                    const marker = markers.find(m => m.id === markerId);
                    if (marker) {
                        console.log('Item not found, creating it first...');
                        await createItemForMarker(marker, rating);
                    }
                }
            }
        } catch (error) {
            console.error('Error updating rating:', error);
        } finally {
            setLoadingRating(null);
        }
    };

    // Create item for marker if it doesn't exist
    const createItemForMarker = async (marker: Marker, rating: number | null) => {
        try {
            // Create the item first using the playlist items API
            const itemPayload = {
                id: marker.id,
                title: marker.title || '',
                startTime: marker.seconds || 0,
                endTime: marker.end_seconds || (marker.seconds || 0) + 30, // default 30 second duration
                rating: rating,
            };

            const createResponse = await fetch('/api/items', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(itemPayload),
            });

            if (createResponse.ok) {
                setRatings(prev => ({
                    ...prev,
                    [marker.id]: rating,
                }));
                console.log('Item created and rating set successfully');
            } else {
                console.error('Failed to create item:', await createResponse.text());
            }
        } catch (error) {
            console.error('Error creating item:', error);
        }
    };

    const eqShallowSet = (a: string[], b: string[]) => {
        if (a.length !== b.length) return false;
        const aa = [...a].sort();
        const bb = [...b].sort();
        for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
        return true;
    };

    const isDirtyExisting = (m: Marker, d: Draft) => {
        const serverTagIds = (m.tags || []).map((t) => t.id);
        const serverNormalizedTagIds = m.primary_tag?.id
            ? Array.from(new Set([m.primary_tag.id, ...serverTagIds]))
            : serverTagIds;

        const server = {
            title: m.title || "",
            seconds: Number(m.seconds || 0),
            end_seconds: m.end_seconds != null ? Number(m.end_seconds) : null,
            primary_tag_id: m.primary_tag?.id ?? null,
            tag_ids: serverNormalizedTagIds,
        };

        const draftNormalizedTags = normalizedTagIds(d);
        const isDirty = (
            d.title !== server.title ||
            d.seconds !== server.seconds ||
            (d.end_seconds ?? null) !== (server.end_seconds ?? null) ||
            d.primary_tag_id !== server.primary_tag_id ||
            !eqShallowSet(draftNormalizedTags, server.tag_ids)
        );


        return isDirty;
    };


    const normalizedTagIds = (d: Draft) =>
        d.primary_tag_id ? Array.from(new Set([d.primary_tag_id, ...d.tag_ids])) : d.tag_ids;

    const isTemp = (id: string) => id.startsWith("tmp_");

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

    // Get primary tag recommendations - tags with children, for when no primary tag is selected
    const getPrimaryTagRecommendations = (): Tag[] => {
        return tagOptions.filter(tag => tag.children && tag.children.length > 0);
    };

    // Handle adding a recommended tag to the marker
    const handleAddRecommendedTag = (markerId: string, tagId: string) => {
        const d = drafts[markerId];
        if (!d) return;

        // Add the tag if it's not already included
        if (!d.tag_ids.includes(tagId)) {
            setDraft(markerId, {
                tag_ids: [...d.tag_ids, tagId]
            });
        }
    };

    // Handle selecting a primary tag from recommendations
    const handleSelectPrimaryTag = (markerId: string, tagId: string) => {
        setDraft(markerId, {
            primary_tag_id: tagId,
            tag_ids: [tagId] // Include primary tag in tag_ids as well
        });
    };

    // Find tag ID by name from available tags
    const findTagIdByName = (tagName: string): string | null => {
        const tag = tagOptions.find(t => t.name === tagName);
        return tag?.id || null;
    };

    // Add "Markers Organised" tag to the scene
    const addMarkersOrganisedTag = async () => {
        const markersOrganisedTagId = findTagIdByName("Markers Organised");
        if (!markersOrganisedTagId || !scene) return;

        // Check if scene already has this tag
        const currentTagIds = (scene.tags || []).map((t: Tag) => t.id);
        if (currentTagIds.includes(markersOrganisedTagId)) return;

        try {
            await updateScene({
                variables: {
                    input: {
                        id: sceneId,
                        tag_ids: [...currentTagIds, markersOrganisedTagId]
                    }
                }
            });
        } catch (e) {
            console.error("Failed to add 'Markers Organised' tag:", e);
        }
    };

    // Save existing (update) OR new (create)
    const handleSaveRow = async (id: string) => {
        const d = drafts[id];
        if (!d) return;

        // Check if marker has both start and end times
        if (typeof d.seconds !== "number" || d.seconds < 0 ||
            d.end_seconds === null || typeof d.end_seconds !== "number" || d.end_seconds < 0) {
            alert("Cannot save marker: Both start time and end time are required.");
            return;
        }

        // Validate that end time is after start time
        if (d.end_seconds <= d.seconds) {
            alert("Cannot save marker: End time must be after start time.");
            return;
        }

        if (isTemp(id)) {
            try {
                setSavingId(id);
                await createSceneMarker({
                    variables: {
                        input: {
                            scene_id: sceneId,
                            title: d.title,
                            seconds: Math.max(0, Number(d.seconds) || 0),
                            end_seconds:
                                typeof d.end_seconds === "number" && Number.isFinite(d.end_seconds)
                                    ? Math.max(0, Number(d.end_seconds))
                                    : null,
                            primary_tag_id: d.primary_tag_id,
                            tag_ids: normalizedTagIds(d),
                        },
                    },
                });
                // Remove temp
                setNewIds((prev) => prev.filter((x) => x !== id));
                setDrafts((prev) => {
                    const newDrafts = { ...prev };
                    delete newDrafts[id];
                    return newDrafts;
                });
                await addMarkersOrganisedTag();
                // Delay refetch to prevent video jumping
                setTimeout(() => refetch(), 100);
            } catch (e) {
                console.error("Failed to create marker:", e);
            } finally {
                setSavingId(null);
            }
        } else {
            // existing -> update
            try {
                setSavingId(id);
                await updateSceneMarker({
                    variables: {
                        input: {
                            id,
                            title: d.title,
                            seconds: Math.max(0, Number(d.seconds) || 0),
                            end_seconds:
                                typeof d.end_seconds === "number" && Number.isFinite(d.end_seconds)
                                    ? Math.max(0, Number(d.end_seconds))
                                    : null,
                            primary_tag_id: d.primary_tag_id,
                            tag_ids: normalizedTagIds(d),
                        },
                    },
                });
                await addMarkersOrganisedTag();
                // Immediately update the draft to match what was just saved to clear "unsaved" state
                // The saved tags will be normalized (primary tag included), so we store the normalized version
                const normalizedTags = normalizedTagIds(d);
                setDrafts((prev) => {
                    const newDraft = {
                        title: d.title,
                        seconds: Math.max(0, Number(d.seconds) || 0),
                        end_seconds: typeof d.end_seconds === "number" && Number.isFinite(d.end_seconds)
                            ? Math.max(0, Number(d.end_seconds))
                            : null,
                        primary_tag_id: d.primary_tag_id,
                        tag_ids: normalizedTags,
                    };
                    return {
                        ...prev,
                        [id]: newDraft,
                    };
                });
                // Delay refetch to prevent video jumping
                setTimeout(() => refetch(), 100);
            } catch (e) {
                console.error("Failed to update marker:", e);
            } finally {
                setSavingId(null);
            }
        }
    };

    const handleResetRow = (id: string) => {
        if (isTemp(id)) {
            // discard new row
            setNewIds((prev) => prev.filter((x) => x !== id));
            setDrafts((prev) => {
                const newDrafts = { ...prev };
                delete newDrafts[id];
                return newDrafts;
            });
            return;
        }
        // reset existing row to server state
        const m = markers.find((mm) => mm.id === id);
        if (!m) return;
        setDrafts((prev) => ({
            ...prev,
            [id]: {
                title: m.title || "",
                seconds: Number(m.seconds || 0),
                end_seconds: m.end_seconds != null ? Number(m.end_seconds) : null,
                primary_tag_id: m.primary_tag?.id ?? null,
                tag_ids: (m.tags || []).map((t) => t.id),
            },
        }));
    };

    const handleDeleteRow = (id: string) => {
        if (isTemp(id)) {
            // Just remove temp row
            setNewIds((prev) => prev.filter((x) => x !== id));
            setDrafts((prev) => {
                const newDrafts = { ...prev };
                delete newDrafts[id];
                return newDrafts;
            });
            return;
        }

        // Show confirmation dialog for existing markers
        const marker = markers.find((m) => m.id === id);
        const markerTitle = marker?.title || "Untitled Marker";
        setMarkerToDelete({ id, title: markerTitle });
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!markerToDelete) return;

        try {
            setSavingId(markerToDelete.id);
            await deleteSceneMarker({
                variables: { id: markerToDelete.id }
            });
            // Remove from drafts while preserving all other draft changes
            setDrafts((prev) => {
                const newDrafts = { ...prev };
                delete newDrafts[markerToDelete.id];
                return newDrafts;
            });
            // Delay refetch to prevent video jumping
            setTimeout(() => refetch(), 100);
        } catch (e) {
            console.error("Failed to delete marker:", e);
        } finally {
            setSavingId(null);
            setDeleteDialogOpen(false);
            setMarkerToDelete(null);
        }
    };

    const cancelDelete = () => {
        setDeleteDialogOpen(false);
        setMarkerToDelete(null);
    };

    // Save All / Reset All must include temp rows as well
    const dirtyExistingEntries = useMemo(
        () =>
            markers
                .map((m) => ({ id: m.id, m, d: drafts[m.id] }))
                .filter(({ d }) => !!d)
                .filter(({ m, d }) => isDirtyExisting(m, d!)),
        [markers, drafts]
    );

    const newEntries = useMemo(
        () => newIds.map((id) => ({ id, d: drafts[id] })).filter(({ d }) => !!d),
        [newIds, drafts]
    );

    const dirtyCount = dirtyExistingEntries.length + newEntries.length;

    const handleSaveAll = async () => {
        if (!dirtyCount) return;

        // Check if any markers are missing primary tags
        const allEntries = [...newEntries, ...dirtyExistingEntries];
        const markersWithoutPrimaryTag = allEntries.filter(({ d }) => !d!.primary_tag_id);

        if (markersWithoutPrimaryTag.length > 0) {
            alert(`Cannot save: ${markersWithoutPrimaryTag.length} marker(s) are missing primary tags. Please add primary tags to all markers before saving.`);
            return;
        }

        // Check if any markers are missing start or end times
        const markersWithoutTimes = allEntries.filter(({ d }) =>
            typeof d!.seconds !== "number" || d!.seconds < 0 ||
            d!.end_seconds === null || typeof d!.end_seconds !== "number" || d!.end_seconds < 0
        );

        if (markersWithoutTimes.length > 0) {
            alert(`Cannot save: ${markersWithoutTimes.length} marker(s) are missing start or end times. Please add both start and end times to all markers before saving.`);
            return;
        }

        // Check if any markers have end time before or equal to start time
        const markersWithInvalidTimes = allEntries.filter(({ d }) =>
            typeof d!.seconds === "number" && typeof d!.end_seconds === "number" && d!.end_seconds <= d!.seconds
        );

        if (markersWithInvalidTimes.length > 0) {
            alert(`Cannot save: ${markersWithInvalidTimes.length} marker(s) have end times that are not after start times. Please ensure end times are after start times for all markers.`);
            return;
        }

        setSavingAll(true);
        try {
            // Handle all mutations sequentially 
            // Create all new markers
            for (const { id, d } of newEntries) {
                await createSceneMarker({
                    variables: {
                        input: {
                            scene_id: sceneId,
                            title: d!.title,
                            seconds: Math.max(0, Number(d!.seconds) || 0),
                            end_seconds:
                                typeof d!.end_seconds === "number" && Number.isFinite(d!.end_seconds)
                                    ? Math.max(0, Number(d!.end_seconds))
                                    : null,
                            primary_tag_id: d!.primary_tag_id,
                            tag_ids: normalizedTagIds(d!),
                        },
                    },
                });
            }

            // Update all dirty existing markers
            for (const { id, d } of dirtyExistingEntries) {
                await updateSceneMarker({
                    variables: {
                        input: {
                            id,
                            title: d!.title,
                            seconds: Math.max(0, Number(d!.seconds) || 0),
                            end_seconds:
                                typeof d!.end_seconds === "number" && Number.isFinite(d!.end_seconds)
                                    ? Math.max(0, Number(d!.end_seconds))
                                    : null,
                            primary_tag_id: d!.primary_tag_id,
                            tag_ids: normalizedTagIds(d!),
                        },
                    },
                });
            }

            // Clear temps and reset existing marker drafts to their saved state
            setNewIds([]);
            setDrafts((prev) => {
                const next = { ...prev };
                // Remove all temporary drafts
                for (const id of Object.keys(next)) if (isTemp(id)) delete next[id];
                // Reset existing markers to match what was just saved
                for (const { id, d } of dirtyExistingEntries) {
                    const normalizedTags = normalizedTagIds(d!);
                    next[id] = {
                        title: d!.title,
                        seconds: Math.max(0, Number(d!.seconds) || 0),
                        end_seconds: typeof d!.end_seconds === "number" && Number.isFinite(d!.end_seconds)
                            ? Math.max(0, Number(d!.end_seconds))
                            : null,
                        primary_tag_id: d!.primary_tag_id,
                        tag_ids: normalizedTags,
                    };
                }
                return next;
            });
            await addMarkersOrganisedTag();
            // Delay refetch to prevent video jumping
            setTimeout(() => refetch(), 100);
        } catch (e) {
            console.error("Save all failed:", e);
        } finally {
            setSavingAll(false);
        }
    };

    const handleResetAll = () => {
        // discard all new
        setNewIds([]);
        setDrafts((prev) => {
            const kept: Record<string, Draft> = {};
            for (const [k, v] of Object.entries(prev)) if (!isTemp(k)) kept[k] = v;
            return kept;
        });
        // reset all existing
        const next: Record<string, Draft> = {};
        for (const m of markers) {
            next[m.id] = {
                title: m.title || "",
                seconds: Number(m.seconds || 0),
                end_seconds: m.end_seconds != null ? Number(m.end_seconds) : null,
                primary_tag_id: m.primary_tag?.id ?? null,
                tag_ids: (m.tags || []).map((t) => t.id),
            };
        }
        setDrafts((prev) => ({ ...prev, ...next }));
    };

    // Common tags apply (Add or Remove) — apply to both existing + new rows
    const handleApplyCommonToAll = () => {
        if (commonTagIds.length === 0) return;
        setDrafts((prev) => {
            const next: typeof prev = { ...prev };
            const allIds = new Set<string>([...newIds, ...markers.map((m) => m.id)]);
            for (const id of allIds) {
                const d = next[id];
                if (!d) continue;
                if (removeCommonMode) {
                    d.tag_ids = d.tag_ids.filter((tid) => !commonTagIds.includes(tid));
                } else {
                    d.tag_ids = Array.from(new Set([...d.tag_ids, ...commonTagIds]));
                }
            }
            return next;
        });
    };

    // Performer tags apply (Add or Remove) — apply to both existing + new rows
    const handleApplyPerformerToAll = () => {
        if (selectedPerformerTagIds.length === 0) return;
        setDrafts((prev) => {
            const next: typeof prev = { ...prev };
            const allIds = new Set<string>([...newIds, ...markers.map((m) => m.id)]);
            for (const id of allIds) {
                const d = next[id];
                if (!d) continue;
                if (removePerformerMode) {
                    d.tag_ids = d.tag_ids.filter((tid) => !selectedPerformerTagIds.includes(tid));
                } else {
                    d.tag_ids = Array.from(new Set([...d.tag_ids, ...selectedPerformerTagIds]));
                }
            }
            return next;
        });
    };

    // Reset performer tags to full list
    const handleResetPerformerTags = () => {
        setSelectedPerformerTagIds(performerTags.map(t => t.id));
    };

    // ---- VideoJS: options + ref ----
    const videoJsOptions = useMemo(
        () => ({
            autoplay: false,
            controls: true,
            responsive: true,
            fluid: true,
            aspectRatio: "16:9",
            poster: posterUrl,
            sources: streamUrl ? [{ src: streamUrl, type: "video/mp4" }] : [],
        }),
        [streamUrl, posterUrl]
    );

    const handlePlayerReady = (player: any) => {
        playerRef.current = player;
        player.muted(true);
        setPlayerReady(true);
    };

    // Seek the VideoJS player to a time & play
    const jumpTo = (sec: number) => {
        const player = playerRef.current;
        if (!player || typeof sec !== "number") return;
        const target = Math.max(0, sec);
        if (player.readyState && player.readyState() < 1) {
            player.one?.("loadedmetadata", () => {
                player.currentTime(target);
                player.play();
            });
        } else {
            player.currentTime(target);
            player.play();
        }
    };

    // Current time helper (rounded seconds)
    const currentPlayerSecond = () => {
        try {
            const t = playerRef.current?.currentTime?.();
            const n = Number(t);
            return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
        } catch {
            return 0;
        }
    };

    // Find closest marker to current time
    const findClosestMarker = useCallback((currentTime: number): string | null => {
        if (!markers || markers.length === 0) return null;

        let closestId: string | null = null;
        let closestDistance = Infinity;

        // Include both existing markers and new markers in drafts
        const allMarkerIds = [...markers.map(m => m.id), ...newIds];

        for (const id of allMarkerIds) {
            const marker = markers.find(m => m.id === id);
            const draft = drafts[id];

            if (!draft && !marker) continue;

            // Get marker time from draft or original marker
            const markerTime = draft?.seconds ?? marker?.seconds ?? 0;
            const distance = Math.abs(currentTime - markerTime);

            if (distance < closestDistance) {
                closestDistance = distance;
                closestId = id;
            }
        }

        return closestId;
    }, [markers, drafts, newIds]);

    // Throttled update of active marker
    const updateActiveMarker = useCallback(() => {
        const currentTime = currentPlayerSecond();
        const closestId = findClosestMarker(currentTime);
        setActiveMarkerId(closestId);
    }, [findClosestMarker]);

    // Listen to video timeupdate to track closest marker with throttling
    useEffect(() => {
        const player = playerRef.current;
        if (!player || !playerReady) return;

        let throttleTimeout: NodeJS.Timeout | null = null;

        const throttledUpdate = () => {
            if (throttleTimeout) return;
            throttleTimeout = setTimeout(() => {
                updateActiveMarker();
                throttleTimeout = null;
            }, 100); // Throttle to ~10fps
        };

        const immediateUpdate = () => {
            updateActiveMarker();
        };

        player.on('timeupdate', throttledUpdate);
        player.on('seeked', immediateUpdate);

        return () => {
            player.off('timeupdate', throttledUpdate);
            player.off('seeked', immediateUpdate);
            if (throttleTimeout) {
                clearTimeout(throttleTimeout);
            }
        };
    }, [playerReady, updateActiveMarker]);

    // Update active marker when drafts change (like when new markers are added)
    useEffect(() => {
        updateActiveMarker();
    }, [drafts, newIds, updateActiveMarker]);

    // Removed handleCardClick - only the Jump button should trigger video seeking

    // Add a new inline marker row
    const addNewInline = () => {
        const id = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const start = currentPlayerSecond();
        const defaultTitle = scene?.title || "New Marker";
        setDrafts((prev) => ({
            ...prev,
            [id]: {
                title: defaultTitle,
                seconds: start,
                end_seconds: null,
                primary_tag_id: null,
                tag_ids: [],
            },
        }));
        setNewIds((prev) => [id, ...prev]);
    };

    // Build render order: sort all markers by time (chronological order)
    const markerMap = useMemo(() => {
        const m = new Map<string, Marker>();
        for (const mk of markers) m.set(mk.id, mk);
        return m;
    }, [markers]);
    const newIdsSet = useMemo(() => new Set(newIds), [newIds]);

    const renderIds = useMemo(() => {
        // Combine all marker IDs (existing + new)
        const allIds = [...newIds, ...markers.map((m) => m.id)];

        // Sort by time (seconds)
        return allIds.sort((a, b) => {
            const aMarker = markers.find(m => m.id === a);
            const aDraft = drafts[a];
            const aTime = aDraft?.seconds ?? aMarker?.seconds ?? 0;

            const bMarker = markers.find(m => m.id === b);
            const bDraft = drafts[b];
            const bTime = bDraft?.seconds ?? bMarker?.seconds ?? 0;

            return aTime - bTime;
        });
    }, [newIds, markers, drafts]);

    // Can the clock buttons read time?
    const canReadPlayerTime = playerReady && !!playerRef.current?.currentTime;

    // Format markers for videojs-markers plugin
    const formatMarkersForVideoJS = useMemo(() => {
        if (!markers || markers.length === 0) return [];

        return markers
            .filter(marker => typeof marker.seconds === 'number' && marker.seconds >= 0)
            .map(marker => ({
                id: marker.id,
                time: marker.seconds,
                text: marker.primary_tag?.name || marker.title || 'Untitled Marker',
                duration: marker.end_seconds ? Math.max(0, marker.end_seconds - marker.seconds) : undefined,
                isActive: marker.id === activeMarkerId
            }))
            .sort((a, b) => a.time - b.time);
    }, [markers, activeMarkerId]);

    return (
        <Container maxWidth={false} sx={{ px: { xs: 1, sm: 1.5, lg: 2 }, py: 1.5 }}>
            <Sheet sx={{ p: 0 }}>
                {/* Title */}
                {loading ? (
                    <Skeleton variant="text" level="h2" width="40%" sx={{ mb: 1.5 }} />
                ) : error ? (
                    <Typography color="danger" level="body-sm" sx={{ mb: 1.5 }}>
                        {error.message}
                    </Typography>
                ) : (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                        <IconButton
                            variant="soft"
                            color="neutral"
                            size="sm"
                            onClick={handleGoBack}
                            sx={{
                                borderRadius: "50%",
                            }}
                        >
                            <ArrowBackIcon />
                        </IconButton>
                        <Typography level="h2">
                            {scene?.title || "Scene"}
                        </Typography>
                        <Box sx={{ flexGrow: 1 }} />
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={() => refetchTags()}
                        >
                            Refresh Tags
                        </Button>
                    </Box>
                )}

                <Grid container spacing={2}>
                    {/* LEFT: Marker editor (40%) */}
                    <Grid xs={12} md={5}>
                        <Card variant="outlined" sx={{ p: 1.25, borderRadius: "lg" }}>
                            {/* Row: header + bulk actions */}
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.75, flexWrap: "wrap" }}>
                                {!loading && scene?.performers && scene.performers.length > 0 && (
                                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                        {scene.performers.map((performer: any) => (
                                            <Chip
                                                key={performer.id}
                                                size="sm"
                                                variant="outlined"
                                                color="primary"
                                                sx={{
                                                    fontWeight: 500,
                                                    borderStyle: "solid",
                                                    borderWidth: 1.5
                                                }}
                                            >
                                                {performer.name}
                                            </Chip>
                                        ))}
                                    </Box>
                                )}
                                <Box sx={{ flexGrow: 1 }} />
                                <Button size="sm" variant="outlined" onClick={addNewInline}>
                                    New Marker
                                </Button>
                                {dirtyCount > 0 && (
                                    <Chip size="sm" variant="soft" color="warning">
                                        {dirtyCount} unsaved
                                    </Chip>
                                )}
                                <Button
                                    size="sm"
                                    variant="plain"
                                    disabled={!dirtyCount}
                                    onClick={handleResetAll}
                                >
                                    Reset All
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={!dirtyCount || savingAll}
                                    onClick={handleSaveAll}
                                    color={(() => {
                                        const allEntries = [...newEntries, ...dirtyExistingEntries];
                                        const hasMarkersWithoutPrimaryTag = allEntries.some(({ d }) => !d!.primary_tag_id);
                                        return hasMarkersWithoutPrimaryTag ? "danger" : "primary";
                                    })()}
                                >
                                    {savingAll ? "Saving…" : "Save"}
                                </Button>
                            </Box>

                            <Divider />

                            {/* Editable list */}
                            <Box sx={{ mt: 0.75, display: "flex", flexDirection: "column", gap: 0.5 }}>
                                {loading || tagsLoading ? (
                                    Array.from({ length: 6 }).map((_, i) => (
                                        <Card key={i} variant="soft" sx={{ p: 1.25 }}>
                                            <Skeleton variant="text" level="title-sm" width="40%" />
                                            <Box
                                                sx={{
                                                    display: "grid",
                                                    gap: 0.75,
                                                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
                                                    mt: 0.75,
                                                }}
                                            >
                                                <Skeleton variant="text" level="body-sm" width="80%" />
                                                <Skeleton variant="text" level="body-sm" width="80%" />
                                                <Skeleton variant="text" level="body-sm" width="80%" />
                                            </Box>
                                        </Card>
                                    ))
                                ) : renderIds.length === 0 ? (
                                    <Sheet
                                        variant="soft"
                                        color="neutral"
                                        sx={{ p: 2, borderRadius: "md", textAlign: "center", mt: 1 }}
                                    >
                                        <Typography level="title-sm">No markers on this scene.</Typography>
                                    </Sheet>
                                ) : (
                                    renderIds.map((id) => {
                                        const isNew = newIdsSet.has(id);
                                        const m = isNew ? undefined : markerMap.get(id);
                                        const d = drafts[id];
                                        if (!d) return null;

                                        const dirty = isNew || (m ? isDirtyExisting(m, d) : true);
                                        const savingThis = savingId === id;
                                        const otherTagIds = d.tag_ids.filter((tid) => tid !== d.primary_tag_id);

                                        const isActiveMarker = id === activeMarkerId;

                                        return (
                                            <Card
                                                key={id}
                                                variant="soft"
                                                sx={(theme) => {
                                                    const activeRing = `0 0 0 2px ${theme.vars.palette.primary[500]}`;
                                                    const hoverShadow = theme.vars.shadow.md;
                                                    return {
                                                        p: 1,
                                                        display: "grid",
                                                        gap: 0.5,
                                                        transition: "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
                                                        boxShadow: isActiveMarker ? activeRing : undefined,
                                                        "&:hover": {
                                                            transform: "translateY(-1px)",
                                                            boxShadow: isActiveMarker ? `${activeRing}, ${hoverShadow}` : hoverShadow,
                                                        },
                                                    };
                                                }}
                                            >
                                                {/* Title row (stable widths) */}
                                                <Box
                                                    sx={{
                                                        display: "grid",
                                                        gridTemplateColumns: { xs: "84px 1fr", sm: "84px 1fr 200px" },
                                                        alignItems: "center",
                                                        gap: 1,
                                                    }}
                                                >
                                                    <Typography level="body-sm" sx={{ width: 84, fontSize: "0.75rem" }}>
                                                        Title
                                                    </Typography>

                                                    <Input
                                                        value={d.title}
                                                        onChange={(e) => setDraft(id, { title: e.target.value })}
                                                        size="sm"
                                                        sx={{ minWidth: 180 }}
                                                    />

                                                    <Box
                                                        sx={{
                                                            display: { xs: "none", sm: "flex" },
                                                            justifyContent: "flex-end",
                                                            gap: 1,
                                                            width: "100%",
                                                            alignItems: "center",
                                                        }}
                                                    >
                                                        {isActiveMarker && (
                                                            <Chip size="sm" variant="soft" color="primary" sx={{ fontWeight: 600 }}>
                                                                ● Active
                                                            </Chip>
                                                        )}
                                                        {isNew && (
                                                            <Chip size="sm" variant="soft" color="primary">
                                                                New
                                                            </Chip>
                                                        )}
                                                        <Button
                                                            size="sm"
                                                            variant="outlined"
                                                            onClick={() => jumpTo(d.seconds)}
                                                        >
                                                            Jump
                                                        </Button>
                                                        <Chip
                                                            size="sm"
                                                            variant="soft"
                                                            color="warning"
                                                            sx={{ visibility: dirty ? "visible" : "hidden" }}
                                                        >
                                                            Unsaved
                                                        </Chip>
                                                    </Box>
                                                </Box>

                                                {/* Seconds (clock icon before each) */}
                                                <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", flexWrap: "wrap" }}>
                                                    <Typography level="body-sm" sx={{ minWidth: 84, fontSize: "0.75rem" }}>
                                                        Start / End
                                                    </Typography>

                                                    {/* Start icon */}
                                                    <Tooltip title="Set start = current video time" variant="soft">
                                                        <span>
                                                            <IconButton
                                                                size="sm"
                                                                variant="soft"
                                                                disabled={!canReadPlayerTime}
                                                                onClick={() => {
                                                                    const t = currentPlayerSecond();
                                                                    setDraft(id, { seconds: t });
                                                                }}
                                                                aria-label="Set start to now"
                                                            >
                                                                <AccessTimeIcon fontSize="small" />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                    <TimeInput
                                                        value={d.seconds}
                                                        onChange={(seconds) => setDraft(id, { seconds })}
                                                        size="sm"
                                                        sx={{ width: 100 }}
                                                        placeholder="0:00"
                                                    />

                                                    {/* End icon */}
                                                    <Tooltip title="Set end = current video time" variant="soft">
                                                        <span>
                                                            <IconButton
                                                                size="sm"
                                                                variant="soft"
                                                                disabled={!canReadPlayerTime}
                                                                onClick={() => {
                                                                    const t = currentPlayerSecond();
                                                                    setDraft(id, { end_seconds: t });
                                                                }}
                                                                aria-label="Set end to now"
                                                            >
                                                                <AccessTimeIcon fontSize="small" />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                    <TimeInput
                                                        value={d.end_seconds ?? 0}
                                                        onChange={(seconds) => setDraft(id, { end_seconds: seconds === 0 ? null : seconds })}
                                                        size="sm"
                                                        sx={{ width: 100 }}
                                                        placeholder="0:00"
                                                    />
                                                </Box>

                                                {/* Primary tag */}
                                                <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", flexWrap: "wrap" }}>
                                                    <Typography level="body-sm" sx={{ minWidth: 84, fontSize: "0.75rem" }}>
                                                        Primary
                                                    </Typography>
                                                    <Autocomplete
                                                        size="sm"
                                                        options={tagOptions}
                                                        value={
                                                            d.primary_tag_id
                                                                ? tagOptions.find((t) => t.id === d.primary_tag_id) || null
                                                                : null
                                                        }
                                                        onChange={(_e, val) => setDraft(id, { primary_tag_id: val?.id ?? null })}
                                                        getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
                                                        isOptionEqualToValue={(a, b) => a?.id === b?.id}
                                                        sx={{
                                                            minWidth: 200,
                                                            flex: 1,
                                                            maxWidth: 400,
                                                            '& .MuiAutocomplete-input': {
                                                                color: !d.primary_tag_id ? 'danger.plainColor' : 'inherit'
                                                            }
                                                        }}
                                                        placeholder="Select primary tag… (Required)"
                                                        color={!d.primary_tag_id ? "danger" : "neutral"}
                                                    />
                                                </Box>

                                                {/* Primary tag recommendations - only show when no primary tag selected */}
                                                {!d.primary_tag_id && (() => {
                                                    const primaryRecommendations = getPrimaryTagRecommendations();
                                                    return primaryRecommendations.length > 0 ? (
                                                        <Box sx={{ display: "flex", gap: 0.5, alignItems: "flex-start", flexWrap: "wrap" }}>
                                                            <Typography level="body-sm" sx={{ minWidth: 84, mt: 0.6, fontSize: "0.75rem" }}>
                                                                Recommended
                                                            </Typography>
                                                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, flex: 1 }}>
                                                                {primaryRecommendations.slice(0, 10).map((tag) => (
                                                                    <Chip
                                                                        key={tag.id}
                                                                        size="sm"
                                                                        variant="soft"
                                                                        color="success"
                                                                        onClick={() => handleSelectPrimaryTag(id, tag.id)}
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
                                                    ) : null;
                                                })()}

                                                {/* Other tags */}
                                                <Box sx={{ display: "flex", gap: 0.5, alignItems: "flex-start", flexWrap: "wrap" }}>
                                                    <Typography level="body-sm" sx={{ minWidth: 84, mt: 0.6, fontSize: "0.75rem" }}>
                                                        Other tags
                                                    </Typography>
                                                    <Autocomplete
                                                        multiple
                                                        size="sm"
                                                        options={tagOptions.filter((t) => t.id !== d.primary_tag_id)}
                                                        value={
                                                            otherTagIds
                                                                .map((tid) => tagOptions.find((t) => t.id === tid))
                                                                .filter(Boolean) as Tag[]
                                                        }
                                                        onChange={(_e, vals) =>
                                                            setDraft(id, {
                                                                tag_ids: Array.from(
                                                                    new Set([
                                                                        ...(d.primary_tag_id ? [d.primary_tag_id] : []),
                                                                        ...vals.map((v) => v.id),
                                                                    ])
                                                                ),
                                                            })
                                                        }
                                                        getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
                                                        isOptionEqualToValue={(a, b) => a?.id === b?.id}
                                                        sx={{ minWidth: 280, flex: 1, maxWidth: 500 }}
                                                        placeholder="Add tags…"
                                                    />
                                                </Box>

                                                {/* Recommended tags */}
                                                {(() => {
                                                    const recommendedTags = getRecommendedTags(d.primary_tag_id, d.tag_ids);
                                                    return recommendedTags.length > 0 ? (
                                                        <Box sx={{ display: "flex", gap: 0.5, alignItems: "flex-start", flexWrap: "wrap" }}>
                                                            <Typography level="body-sm" sx={{ minWidth: 84, mt: 0.6, fontSize: "0.75rem" }}>
                                                                Recommended
                                                            </Typography>
                                                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, flex: 1 }}>
                                                                {recommendedTags.map((tag) => (
                                                                    <Chip
                                                                        key={tag.id}
                                                                        size="sm"
                                                                        variant="soft"
                                                                        color="primary"
                                                                        onClick={() => handleAddRecommendedTag(id, tag.id)}
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
                                                    ) : null;
                                                })()}

                                                {/* Rating */}
                                                <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", flexWrap: "wrap" }}>
                                                    <Typography level="body-sm" sx={{ minWidth: 84, fontSize: "0.75rem" }}>
                                                        Rating
                                                    </Typography>
                                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                                        <StarRating
                                                            value={ratings[id] || null}
                                                            onChange={(rating) => handleRatingChange(id, rating)}
                                                            readonly={isNew || loadingRating === id}
                                                            size="sm"
                                                        />
                                                        {loadingRating === id && (
                                                            <Typography level="body-xs" sx={{ opacity: 0.7 }}>
                                                                Saving...
                                                            </Typography>
                                                        )}
                                                        {isNew && (
                                                            <Typography level="body-xs" sx={{ opacity: 0.7 }}>
                                                                Save marker first
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                </Box>

                                                {/* Per-row actions */}
                                                <Box sx={{ display: "flex", gap: 0.5, justifyContent: "flex-end", mt: 0.25 }}>
                                                    <Tooltip title="Delete marker" variant="soft">
                                                        <IconButton
                                                            size="sm"
                                                            variant="soft"
                                                            color="danger"
                                                            disabled={savingThis || savingAll}
                                                            onClick={() => handleDeleteRow(id)}
                                                            aria-label="Delete marker"
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Button
                                                        size="sm"
                                                        variant="plain"
                                                        disabled={savingThis || savingAll}
                                                        onClick={() => handleResetRow(id)}
                                                    >
                                                        {isNew ? "Discard" : "Reset"}
                                                    </Button>
                                                </Box>
                                            </Card>
                                        );
                                    })
                                )}
                            </Box>

                            {/* Common Tags (bulk add/remove) */}
                            <Box
                                sx={{
                                    borderTop: "1px solid",
                                    borderColor: "divider",
                                    pt: 1.5,
                                    mt: 2,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                }}
                            >
                                <Typography level="title-sm">Common Tags</Typography>

                                <Autocomplete
                                    multiple
                                    size="sm"
                                    options={tagOptions}
                                    value={commonTagIds
                                        .map((id) => tagOptions.find((t) => t.id === id))
                                        .filter(Boolean) as Tag[]}
                                    onChange={(_e, vals) =>
                                        setCommonTagIds(Array.from(new Set(vals.map((v) => v.id))))
                                    }
                                    getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
                                    isOptionEqualToValue={(a, b) => a?.id === b?.id}
                                    sx={{ minWidth: 320, maxWidth: 720 }}
                                    placeholder="Pick tags to add/remove on every marker…"
                                />

                                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                                    <Checkbox
                                        size="sm"
                                        label="Remove instead of add"
                                        checked={removeCommonMode}
                                        onChange={(e) => setRemoveCommonMode(e.target.checked)}
                                    />
                                    <Box sx={{ flexGrow: 1 }} />
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        disabled={commonTagIds.length === 0 || savingAll}
                                        onClick={() => setCommonTagIds([])}
                                    >
                                        Clear
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outlined"
                                        disabled={commonTagIds.length === 0 || savingAll}
                                        onClick={handleApplyCommonToAll}
                                    >
                                        Apply to all (drafts)
                                    </Button>
                                </Box>

                                <Typography level="body-xs" sx={{ opacity: 0.8 }}>
                                    {removeCommonMode
                                        ? "Removes these tags from each marker's draft. Primary tag (if set) is preserved when saving."
                                        : "Adds these tags to each marker's draft (keeps existing tags and primary)."}
                                </Typography>
                            </Box>

                            {/* Performer Tags (bulk add/remove from performer tags) */}
                            {performerTags.length > 0 && (
                                <Box
                                    sx={{
                                        borderTop: "1px solid",
                                        borderColor: "divider",
                                        pt: 1.5,
                                        mt: 2,
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 1,
                                    }}
                                >
                                    <Typography level="title-sm">Performer Tags</Typography>

                                    <Autocomplete
                                        multiple
                                        size="sm"
                                        options={performerTags}
                                        value={selectedPerformerTagIds
                                            .map((id) => performerTags.find((t) => t.id === id))
                                            .filter(Boolean) as Tag[]}
                                        onChange={(_e, vals) =>
                                            setSelectedPerformerTagIds(vals.map((v) => v.id))
                                        }
                                        getOptionLabel={(o) => (typeof o === "string" ? o : (o as Tag).name)}
                                        isOptionEqualToValue={(a, b) => a?.id === b?.id}
                                        sx={{ minWidth: 320, maxWidth: 720 }}
                                        placeholder="Remove unwanted performer tags..."
                                        limitTags={6}
                                    />

                                    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                                        <Checkbox
                                            size="sm"
                                            label="Remove instead of add"
                                            checked={removePerformerMode}
                                            onChange={(e) => setRemovePerformerMode(e.target.checked)}
                                        />
                                        <Box sx={{ flexGrow: 1 }} />
                                        <Button
                                            size="sm"
                                            variant="plain"
                                            disabled={selectedPerformerTagIds.length === 0 || savingAll}
                                            onClick={handleResetPerformerTags}
                                        >
                                            Reset
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outlined"
                                            disabled={selectedPerformerTagIds.length === 0 || savingAll}
                                            onClick={handleApplyPerformerToAll}
                                        >
                                            Apply to all (drafts)
                                        </Button>
                                    </Box>

                                    <Typography level="body-xs" sx={{ opacity: 0.8 }}>
                                        {removePerformerMode
                                            ? "Removes selected performer tags from each marker's draft. Primary tag (if set) is preserved when saving."
                                            : "Adds selected performer tags to each marker's draft (keeps existing tags and primary)."}
                                    </Typography>
                                </Box>
                            )}
                        </Card>
                    </Grid>

                    {/* RIGHT: VideoJS player (60%) */}
                    <Grid xs={12} md={7} sx={{ display: "flex" }}>
                        <Sheet
                            variant="plain"
                            sx={{
                                p: 0,
                                borderRadius: 0,
                                bgcolor: "transparent",
                                width: "100%",
                                mx: "auto",
                            }}
                        >
                            <Box
                                sx={{
                                    width: "100%",
                                    "& .video-js": {
                                        width: "100%",
                                        height: "auto",
                                        borderRadius: 0,
                                        overflow: "visible",
                                    },
                                    "& .vjs-control-bar": { bottom: 0 },
                                }}
                            >
                                {/* Only render VideoJS when we have scene data and settings */}
                                {scene && stashServer && stashAPI ? (
                                    <VideoJS
                                        options={videoJsOptions}
                                        onReady={handlePlayerReady}
                                        hasStarted={hasStarted}
                                        onEnded={() => setHasStarted(true)}
                                        vttPath={scene?.paths?.vtt}
                                        stashServer={stashServer}
                                        stashAPI={stashAPI}
                                        markers={formatMarkersForVideoJS}
                                    />
                                ) : (
                                    <Box
                                        sx={{
                                            width: "100%",
                                            aspectRatio: "16/9",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            bgcolor: "neutral.100",
                                            borderRadius: "md"
                                        }}
                                    >
                                        <Typography level="body-sm">Loading video player...</Typography>
                                    </Box>
                                )}
                            </Box>
                        </Sheet>
                    </Grid>
                </Grid>
            </Sheet>

            {/* Delete Confirmation Dialog */}
            <Modal open={deleteDialogOpen} onClose={cancelDelete}>
                <ModalDialog sx={{ minWidth: 360 }}>
                    <DialogTitle>Delete Marker</DialogTitle>
                    <DialogContent>
                        <Typography level="body-sm">
                            Are you sure you want to delete &quot;{markerToDelete?.title}&quot;?
                        </Typography>
                        <Typography level="body-xs" sx={{ mt: 1, opacity: 0.8 }}>
                            This action cannot be undone.
                        </Typography>
                    </DialogContent>
                    <DialogActions>
                        <Button variant="plain" onClick={cancelDelete}>
                            Cancel
                        </Button>
                        <Button color="danger" onClick={confirmDelete}>
                            Delete
                        </Button>
                    </DialogActions>
                </ModalDialog>
            </Modal>
        </Container>
    );
}
