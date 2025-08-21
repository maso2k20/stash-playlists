// filepath: src/app/actors/[id]/scenes/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, gql } from "@apollo/client";
import Link from "next/link";
import { useSettings } from "@/app/context/SettingsContext";
import { useStashTags } from "@/context/StashTagsContext";
import { usePathname } from "next/navigation";
import { makeStashUrl } from "@/lib/urlUtils";
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
    Skeleton,
    Chip,
    Checkbox,
} from "@mui/joy";

/* Tag-filtered query: includes tags: INCLUDES $markersOrganisedIds */
const GET_ACTOR_SCENES_WITH_TAG = gql`
  query findActorScenesWithTag(
    $actorId: ID!
    $hasMarkers: String
    $markersOrganisedIds: [ID!]!
    $pageNumber: Int
    $perPage: Int
  ) {
    findScenes(
      scene_filter: {
        performers: { modifier: INCLUDES, value: [$actorId] }
        has_markers: $hasMarkers
        tags: { modifier: INCLUDES, value: $markersOrganisedIds }
      }
      filter: { page: $pageNumber, per_page: $perPage }
    ) {
      scenes {
        id
        title
        paths { screenshot vtt }
      }
    }
  }
`;

/* Tag-excluded query: excludes tags: EXCLUDES $markersOrganisedIds */
const GET_ACTOR_SCENES_WITHOUT_TAG = gql`
  query findActorScenesWithoutTag(
    $actorId: ID!
    $hasMarkers: String
    $markersOrganisedIds: [ID!]!
    $pageNumber: Int
    $perPage: Int
  ) {
    findScenes(
      scene_filter: {
        performers: { modifier: INCLUDES, value: [$actorId] }
        has_markers: $hasMarkers
        tags: { modifier: EXCLUDES, value: $markersOrganisedIds }
      }
      filter: { page: $pageNumber, per_page: $perPage }
    ) {
      scenes {
        id
        title
        paths { screenshot vtt }
      }
    }
  }
`;


function HoverPreview({
    screenshot,
    preview,
    alt,
    stashBase,
    apiKey,
}: {
    screenshot?: string | null;
    preview?: string | null;
    alt: string;
    stashBase?: string;
    apiKey?: string;
}) {
    const [hovered, setHovered] = useState(false);
    const [videoErrored, setVideoErrored] = useState(false);

    const resolvedPreview = makeStashUrl(preview, stashBase, apiKey);
    const resolvedShot = makeStashUrl(screenshot, stashBase, apiKey);

    const hasPreview = !!resolvedPreview;
    const isVideo = hasPreview && /\.(webm|mp4)(?:$|\?)/i.test(resolvedPreview);
    const showVideo = hovered && isVideo && !videoErrored;
    const imgSrc = hovered && hasPreview && !isVideo ? resolvedPreview : resolvedShot;

    return (
        <Box
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
            tabIndex={0}
            sx={{ position: "relative", width: "100%", height: "100%", outline: "none" }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={imgSrc}
                alt={alt}
                loading="lazy"
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: showVideo ? "none" : "block",
                    pointerEvents: "none",
                }}
            />
            {showVideo && (
                <video
                    src={resolvedPreview}
                    muted
                    loop
                    autoPlay
                    playsInline
                    preload="metadata"
                    onError={() => setVideoErrored(true)}
                    style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        pointerEvents: "none",
                    }}
                />
            )}
        </Box>
    );
}

export default function ActorScenesPage() {
    const params = useParams<{ id: string }>();
    const actorId = params.id;

    const pathname = usePathname();
    const isScenesPage = pathname?.includes("/scenes");

    // Filters
    const [hasMarkers, setHasMarkers] = useState<"true" | "false">("true");
    const [markersOrganised, setMarkersOrganised] = useState<boolean>(false);
    
    // Get tag options from context
    const { stashTags, refetch: refetchTags } = useStashTags();
    
    // Find tag ID by name (same pattern as scenes detail page)
    const findTagIdByName = (tagName: string): string | null => {
        const tag = stashTags?.find((t: any) => t.name === tagName);
        return tag?.id ? String(tag.id) : null;
    };
    
    const markersTagId = findTagIdByName("Markers Organised");

    // Pagination
    const [pageNumber, setPageNumber] = useState(1);
    const perPage = 60;

    // Reset page when filters change
    useEffect(() => {
        setPageNumber(1);
    }, [hasMarkers, markersOrganised]);

    // Smooth scroll on page change
    useEffect(() => {
        if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    }, [pageNumber]);

    // Query selection: run exactly one
    const withTagVars = {
        actorId,
        hasMarkers,
        markersOrganisedIds: markersTagId ? [markersTagId] : [],
        pageNumber,
        perPage,
    };

    const {
        data: dataWithTag,
        loading: loadingWithTag,
        error: errorWithTag,
    } = useQuery(GET_ACTOR_SCENES_WITH_TAG, {
        variables: withTagVars,
        skip: !markersOrganised || !markersTagId, // skip when checkbox is unchecked or tag not found
        fetchPolicy: "cache-and-network",
    });

    const {
        data: dataWithoutTag,
        loading: loadingWithoutTag,
        error: errorWithoutTag,
    } = useQuery(GET_ACTOR_SCENES_WITHOUT_TAG, {
        variables: withTagVars,
        skip: markersOrganised || !markersTagId, // skip when checkbox is checked or tag not found
        fetchPolicy: "cache-and-network",
    });

    const loading = markersOrganised ? loadingWithTag : loadingWithoutTag;
    const error = markersOrganised ? errorWithTag : errorWithoutTag;
    const scenes = markersOrganised 
        ? (dataWithTag?.findScenes?.scenes ?? [])
        : (dataWithoutTag?.findScenes?.scenes ?? []);

    // Pagination heuristics
    const hasNextPage = scenes.length === perPage;
    const hasPrevPage = pageNumber > 1;

    // Settings for absolute URLs
    const settings = useSettings();
    const stashServer = settings["STASH_SERVER"];
    const stashAPI = settings["STASH_API"];

    return (
        <Sheet sx={{ p: 2, maxWidth: "90vw", mx: "auto" }}>
            {/* Header / Nav */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexGrow: 1 }}>
                <Link href={`/actors/${actorId}`} passHref>
                    <Button
                        size="sm"
                        variant={isScenesPage ? "soft" : "solid"} // swap for opposite
                    >
                        Markers
                    </Button>
                </Link>
                <Link href={`/actors/${actorId}/scenes`} passHref>
                    <Button
                        size="sm"
                        variant={isScenesPage ? "solid" : "soft"} // current page highlighted
                    >
                        Scenes
                    </Button>
                </Link>
            </Box>

            {/* Filter toggles */}
            <Box
                sx={{
                    display: "flex",
                    gap: 2,
                    alignItems: "center",
                    flexWrap: "wrap",
                    borderTop: "1px solid",
                    borderColor: "divider",
                    pt: 2,   // padding-top
                    mt: 1.5,   // margin-top to separate from buttons
                    mb: 2,     // margin-bottom before scenes grid
                }}
            >
                <Checkbox
                    size="sm"
                    label="Has Markers"
                    checked={hasMarkers === "true"}
                    onChange={(e) => setHasMarkers(e.target.checked ? "true" : "false")}
                />
                <Checkbox
                    size="sm"
                    label="Markers Organised"
                    checked={markersOrganised}
                    disabled={!markersTagId}
                    onChange={(e) => setMarkersOrganised(e.target.checked)}
                />
                <Button
                    size="sm"
                    variant="outlined"
                    color="neutral"
                    onClick={() => refetchTags()}
                    sx={{ ml: 'auto' }}
                >
                    Refresh Tags
                </Button>
            </Box>

            {/* Loading skeletons */}
            {loading && (
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

            {!loading && error && (
                <Typography color="danger" level="body-sm" sx={{ mb: 2 }}>
                    {error.message}
                </Typography>
            )}

            {!loading && !error && scenes.length === 0 && (
                <Sheet
                    variant="soft"
                    color="neutral"
                    sx={{ p: 3, borderRadius: "lg", textAlign: "center" }}
                >
                    <Typography level="title-md">No scenes found.</Typography>
                </Sheet>
            )}

            {!loading && !error && scenes.length > 0 && (
                <>
                    <Grid container spacing={2}>
                        {scenes.map((scene: any) => {
                            const screenshot = scene.paths?.screenshot ?? "";
                            return (
                                <Grid key={scene.id} xs={12} sm={6} md={4} lg={3} xl={2}>
                                    <Link href={`/scenes/${scene.id}`} style={{ textDecoration: "none" }}>
                                        <Card
                                            sx={{
                                                p: 0,
                                                overflow: "hidden",
                                                borderRadius: "lg",
                                                position: "relative",
                                                boxShadow: "sm",
                                                transition: "transform 150ms ease, box-shadow 150ms ease",
                                                "&:hover": { transform: "translateY(-2px)", boxShadow: "md" },
                                                cursor: "pointer",
                                            }}
                                        >
                                            <AspectRatio ratio="16/9">
                                                <CardCover sx={{ pointerEvents: "auto" }}>
                                                    <HoverPreview
                                                        screenshot={screenshot}
                                                        preview={null}
                                                        alt={scene.title}
                                                        stashBase={stashServer}
                                                        apiKey={stashAPI}
                                                    />
                                                </CardCover>
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
                                                        title={scene.title}
                                                    >
                                                        {scene.title}
                                                    </Typography>
                                                </Box>
                                            </AspectRatio>
                                        </Card>
                                    </Link>
                                </Grid>

                            );
                        })}
                    </Grid>

                    {/* Pagination */}
                    <Box
                        sx={{
                            mt: 2,
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            justifyContent: "center",
                            flexWrap: "wrap",
                        }}
                    >
                        <Button
                            size="sm"
                            variant="outlined"
                            disabled={!hasPrevPage || loading}
                            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                        >
                            Previous
                        </Button>

                        <Chip size="sm" variant="soft">
                            Page {pageNumber}
                        </Chip>

                        <Button
                            size="sm"
                            variant="outlined"
                            disabled={!hasNextPage || loading}
                            onClick={() => setPageNumber((p) => p + 1)}
                        >
                            Next
                        </Button>
                    </Box>
                </>
            )}
        </Sheet>
    );
}
