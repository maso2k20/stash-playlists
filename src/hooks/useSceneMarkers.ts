"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, gql } from "@apollo/client";
import type { Tag, Marker, Draft } from "@/types/markers";

// GraphQL Queries and Mutations
export const GET_SCENE_FOR_TAG_MANAGEMENT = gql`
  query getSceneForTagManagement($id: ID!) {
    findScene(id: $id) {
      id
      title
      paths { screenshot vtt stream }
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

export const UPDATE_SCENE_MARKER = gql`
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

export const CREATE_SCENE_MARKER = gql`
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

export const DELETE_SCENE_MARKER = gql`
  mutation deleteSceneMarker($id: ID!) {
    sceneMarkerDestroy(id: $id)
  }
`;

export const UPDATE_SCENE = gql`
  mutation updateScene($input: SceneUpdateInput!) {
    sceneUpdate(input: $input) {
      id
      tags { id name }
    }
  }
`;

// Helper functions
const isTemp = (id: string) => id.startsWith("tmp_");

const eqShallowSet = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const aa = [...a].sort();
    const bb = [...b].sort();
    for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
    return true;
};

const normalizedTagIds = (d: Draft) =>
    d.primary_tag_id ? Array.from(new Set([d.primary_tag_id, ...d.tag_ids])) : d.tag_ids;

export interface UseSceneMarkersReturn {
    // Data
    scene: any;
    markers: Marker[];
    drafts: Record<string, Draft>;
    newIds: string[];
    loading: boolean;
    error: any;

    // State
    savingId: string | null;
    savingAll: boolean;

    // Computed
    dirtyCount: number;
    dirtyExistingEntries: { id: string; d: Draft }[];
    newEntries: { id: string; d: Draft }[];

    // Actions
    setDraft: (id: string, patch: Partial<Draft>) => void;
    addNewMarker: (initialDraft?: Partial<Draft>) => string;
    handleSaveRow: (id: string) => Promise<void>;
    handleResetRow: (id: string) => void;
    handleDeleteRow: (id: string) => Promise<void>;
    handleSaveAll: () => Promise<void>;
    handleResetAll: () => void;
    addMarkersOrganisedTag: () => Promise<void>;

    // Utilities
    isDirtyExisting: (marker: Marker, draft: Draft) => boolean;
    isTemp: (id: string) => boolean;
    refetch: () => Promise<any>;
}

export function useSceneMarkers(sceneId: string, tagOptions: Tag[] = []): UseSceneMarkersReturn {
    // GraphQL
    const { data, loading, error, refetch } = useQuery(GET_SCENE_FOR_TAG_MANAGEMENT, {
        variables: { id: sceneId },
        fetchPolicy: "cache-and-network",
    });

    const [updateSceneMarker] = useMutation(UPDATE_SCENE_MARKER);
    const [createSceneMarker] = useMutation(CREATE_SCENE_MARKER);
    const [deleteSceneMarker] = useMutation(DELETE_SCENE_MARKER);
    const [updateScene] = useMutation(UPDATE_SCENE);

    const scene = data?.findScene;
    const markers: Marker[] = useMemo(
        () => (scene?.scene_markers ?? []) as Marker[],
        [scene?.scene_markers]
    );

    // State
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [savingAll, setSavingAll] = useState(false);
    const [newIds, setNewIds] = useState<string[]>([]);

    // Initialize drafts from server markers
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
            const preserved = { ...prev };
            for (const [markerId, draft] of Object.entries(next)) {
                if (!preserved[markerId]) {
                    preserved[markerId] = draft;
                }
            }
            return preserved;
        });
    }, [markers]);

    // Draft helpers
    const setDraft = useCallback((id: string, patch: Partial<Draft>) => {
        setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || ({} as Draft)), ...patch } }));
    }, []);

    const isDirtyExisting = useCallback((m: Marker, d: Draft) => {
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
        return (
            d.title !== server.title ||
            d.seconds !== server.seconds ||
            (d.end_seconds ?? null) !== (server.end_seconds ?? null) ||
            d.primary_tag_id !== server.primary_tag_id ||
            !eqShallowSet(draftNormalizedTags, server.tag_ids)
        );
    }, []);

    // Computed dirty entries
    const dirtyExistingEntries = useMemo(() => {
        return markers
            .filter((m) => {
                const d = drafts[m.id];
                return d && isDirtyExisting(m, d);
            })
            .map((m) => ({ id: m.id, d: drafts[m.id] }));
    }, [markers, drafts, isDirtyExisting]);

    const newEntries = useMemo(
        () => newIds.map((id) => ({ id, d: drafts[id] })).filter(({ d }) => !!d),
        [newIds, drafts]
    );

    const dirtyCount = dirtyExistingEntries.length + newEntries.length;

    // Find tag ID by name
    const findTagIdByName = useCallback((tagName: string): string | null => {
        const tag = tagOptions.find(t => t.name === tagName);
        return tag?.id || null;
    }, [tagOptions]);

    // Add "Markers Organised" tag to scene
    const addMarkersOrganisedTag = useCallback(async () => {
        const markersOrganisedTagId = findTagIdByName("Markers Organised");
        if (!markersOrganisedTagId || !scene) return;

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
    }, [findTagIdByName, scene, sceneId, updateScene]);

    // Add new marker
    const addNewMarker = useCallback((initialDraft?: Partial<Draft>) => {
        const tmpId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        setNewIds((prev) => [...prev, tmpId]);
        setDrafts((prev) => ({
            ...prev,
            [tmpId]: {
                title: initialDraft?.title || "",
                seconds: initialDraft?.seconds ?? 0,
                end_seconds: initialDraft?.end_seconds ?? null,
                primary_tag_id: initialDraft?.primary_tag_id ?? null,
                tag_ids: initialDraft?.tag_ids ?? [],
            },
        }));
        return tmpId;
    }, []);

    // Save single row
    const handleSaveRow = useCallback(async (id: string) => {
        const d = drafts[id];
        if (!d) return;

        // Validation
        if (typeof d.seconds !== "number" || d.seconds < 0 ||
            d.end_seconds === null || typeof d.end_seconds !== "number" || d.end_seconds < 0) {
            alert("Cannot save marker: Both start time and end time are required.");
            return;
        }

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
                            end_seconds: typeof d.end_seconds === "number" && Number.isFinite(d.end_seconds)
                                ? Math.max(0, Number(d.end_seconds))
                                : null,
                            primary_tag_id: d.primary_tag_id,
                            tag_ids: normalizedTagIds(d),
                        },
                    },
                });

                setNewIds((prev) => prev.filter((x) => x !== id));
                setDrafts((prev) => {
                    const newDrafts = { ...prev };
                    delete newDrafts[id];
                    return newDrafts;
                });
                await addMarkersOrganisedTag();
                setTimeout(() => refetch(), 100);
            } catch (e) {
                console.error("Failed to create marker:", e);
            } finally {
                setSavingId(null);
            }
        } else {
            try {
                setSavingId(id);
                await updateSceneMarker({
                    variables: {
                        input: {
                            id,
                            title: d.title,
                            seconds: Math.max(0, Number(d.seconds) || 0),
                            end_seconds: typeof d.end_seconds === "number" && Number.isFinite(d.end_seconds)
                                ? Math.max(0, Number(d.end_seconds))
                                : null,
                            primary_tag_id: d.primary_tag_id,
                            tag_ids: normalizedTagIds(d),
                        },
                    },
                    update: (cache, { data }) => {
                        if (data?.sceneMarkerUpdate) {
                            const existingData = cache.readQuery({
                                query: GET_SCENE_FOR_TAG_MANAGEMENT,
                                variables: { id: sceneId }
                            }) as any;

                            if (existingData?.findScene) {
                                const updatedMarkers = existingData.findScene.scene_markers.map((marker: any) =>
                                    marker.id === id ? data.sceneMarkerUpdate : marker
                                );

                                cache.writeQuery({
                                    query: GET_SCENE_FOR_TAG_MANAGEMENT,
                                    variables: { id: sceneId },
                                    data: {
                                        ...existingData,
                                        findScene: {
                                            ...existingData.findScene,
                                            scene_markers: updatedMarkers
                                        }
                                    }
                                });
                            }
                        }
                    }
                });
            } catch (e) {
                console.error("Failed to update marker:", e);
            } finally {
                setSavingId(null);
            }
        }
    }, [drafts, sceneId, createSceneMarker, updateSceneMarker, addMarkersOrganisedTag, refetch]);

    // Reset single row
    const handleResetRow = useCallback((id: string) => {
        if (isTemp(id)) {
            setNewIds((prev) => prev.filter((x) => x !== id));
            setDrafts((prev) => {
                const newDrafts = { ...prev };
                delete newDrafts[id];
                return newDrafts;
            });
        } else {
            const m = markers.find((marker) => marker.id === id);
            if (m) {
                setDraft(id, {
                    title: m.title || "",
                    seconds: Number(m.seconds || 0),
                    end_seconds: m.end_seconds != null ? Number(m.end_seconds) : null,
                    primary_tag_id: m.primary_tag?.id ?? null,
                    tag_ids: (m.tags || []).map((t) => t.id),
                });
            }
        }
    }, [markers, setDraft]);

    // Delete single row
    const handleDeleteRow = useCallback(async (id: string) => {
        if (isTemp(id)) {
            setNewIds((prev) => prev.filter((x) => x !== id));
            setDrafts((prev) => {
                const newDrafts = { ...prev };
                delete newDrafts[id];
                return newDrafts;
            });
        } else {
            try {
                setSavingId(id);
                await deleteSceneMarker({
                    variables: { id },
                    update: (cache) => {
                        const existingData = cache.readQuery({
                            query: GET_SCENE_FOR_TAG_MANAGEMENT,
                            variables: { id: sceneId }
                        }) as any;

                        if (existingData?.findScene) {
                            cache.writeQuery({
                                query: GET_SCENE_FOR_TAG_MANAGEMENT,
                                variables: { id: sceneId },
                                data: {
                                    ...existingData,
                                    findScene: {
                                        ...existingData.findScene,
                                        scene_markers: existingData.findScene.scene_markers.filter(
                                            (m: any) => m.id !== id
                                        )
                                    }
                                }
                            });
                        }
                    }
                });
                setDrafts((prev) => {
                    const newDrafts = { ...prev };
                    delete newDrafts[id];
                    return newDrafts;
                });
            } catch (e) {
                console.error("Failed to delete marker:", e);
            } finally {
                setSavingId(null);
            }
        }
    }, [sceneId, deleteSceneMarker]);

    // Save all
    const handleSaveAll = useCallback(async () => {
        if (!dirtyCount) return;

        const allEntries = [...newEntries, ...dirtyExistingEntries];

        // Validations
        const markersWithoutPrimaryTag = allEntries.filter(({ d }) => !d!.primary_tag_id);
        if (markersWithoutPrimaryTag.length > 0) {
            alert(`Cannot save: ${markersWithoutPrimaryTag.length} marker(s) are missing primary tags.`);
            return;
        }

        const markersWithoutTimes = allEntries.filter(({ d }) =>
            typeof d!.seconds !== "number" || d!.seconds < 0 ||
            d!.end_seconds === null || typeof d!.end_seconds !== "number" || d!.end_seconds < 0
        );
        if (markersWithoutTimes.length > 0) {
            alert(`Cannot save: ${markersWithoutTimes.length} marker(s) are missing start or end times.`);
            return;
        }

        const markersWithInvalidTimes = allEntries.filter(({ d }) =>
            typeof d!.seconds === "number" && typeof d!.end_seconds === "number" && d!.end_seconds <= d!.seconds
        );
        if (markersWithInvalidTimes.length > 0) {
            alert(`Cannot save: ${markersWithInvalidTimes.length} marker(s) have invalid times.`);
            return;
        }

        setSavingAll(true);
        try {
            // Create new markers
            const createPromises = newEntries.map(({ d }) =>
                createSceneMarker({
                    variables: {
                        input: {
                            scene_id: sceneId,
                            title: d!.title,
                            seconds: Math.max(0, Number(d!.seconds) || 0),
                            end_seconds: typeof d!.end_seconds === "number" && Number.isFinite(d!.end_seconds)
                                ? Math.max(0, Number(d!.end_seconds))
                                : null,
                            primary_tag_id: d!.primary_tag_id,
                            tag_ids: normalizedTagIds(d!),
                        },
                    },
                })
            );

            // Update existing markers
            const updatePromises = dirtyExistingEntries.map(({ id, d }) =>
                updateSceneMarker({
                    variables: {
                        input: {
                            id,
                            title: d!.title,
                            seconds: Math.max(0, Number(d!.seconds) || 0),
                            end_seconds: typeof d!.end_seconds === "number" && Number.isFinite(d!.end_seconds)
                                ? Math.max(0, Number(d!.end_seconds))
                                : null,
                            primary_tag_id: d!.primary_tag_id,
                            tag_ids: normalizedTagIds(d!),
                        },
                    },
                })
            );

            await Promise.all([...createPromises, ...updatePromises]);

            // Clear temps and reset existing
            setNewIds([]);
            setDrafts((prev) => {
                const next = { ...prev };
                for (const id of Object.keys(next)) if (isTemp(id)) delete next[id];
                for (const { id, d } of dirtyExistingEntries) {
                    next[id] = {
                        title: d!.title,
                        seconds: Math.max(0, Number(d!.seconds) || 0),
                        end_seconds: typeof d!.end_seconds === "number" && Number.isFinite(d!.end_seconds)
                            ? Math.max(0, Number(d!.end_seconds))
                            : null,
                        primary_tag_id: d!.primary_tag_id,
                        tag_ids: normalizedTagIds(d!),
                    };
                }
                return next;
            });

            await addMarkersOrganisedTag();
            setTimeout(() => refetch(), 100);
        } catch (e) {
            console.error("Save all failed:", e);
        } finally {
            setSavingAll(false);
        }
    }, [dirtyCount, newEntries, dirtyExistingEntries, sceneId, createSceneMarker, updateSceneMarker, addMarkersOrganisedTag, refetch]);

    // Reset all
    const handleResetAll = useCallback(() => {
        setNewIds([]);
        setDrafts((prev) => {
            const kept: Record<string, Draft> = {};
            for (const [k, v] of Object.entries(prev)) if (!isTemp(k)) kept[k] = v;
            return kept;
        });

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
    }, [markers]);

    return {
        // Data
        scene,
        markers,
        drafts,
        newIds,
        loading,
        error,

        // State
        savingId,
        savingAll,

        // Computed
        dirtyCount,
        dirtyExistingEntries,
        newEntries,

        // Actions
        setDraft,
        addNewMarker,
        handleSaveRow,
        handleResetRow,
        handleDeleteRow,
        handleSaveAll,
        handleResetAll,
        addMarkersOrganisedTag,

        // Utilities
        isDirtyExisting,
        isTemp,
        refetch,
    };
}
