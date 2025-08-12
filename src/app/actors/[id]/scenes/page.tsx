// filepath: src/app/actors/[id]/scenes/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, gql } from "@apollo/client";
import Link from "next/link";
import { useSettings } from "@/app/context/SettingsContext";
import { usePathname } from "next/navigation";
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

/* Base query: NO tag filter */
const GET_ACTOR_SCENES_BASE = gql`
  query findActorScenesBase(
    $actorId: ID!
    $hasMarkers: String
    $pageNumber: Int
    $perPage: Int
  ) {
    findScenes(
      scene_filter: {
        performers: { modifier: INCLUDES, value: [$actorId] }
        has_markers: $hasMarkers
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
        paths { screenshot }
      }
    }
  }
`;

function joinUrl(base?: string, path?: string) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    if (!base) return path;
    return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
function withApiKey(url: string, apiKey?: string) {
    if (!url || !apiKey) return url;
    if (/[?&]api_key=/.test(url)) return url;
    return url.includes("?") ? `${url}&api_key=${apiKey}` : `${url}?api_key=${apiKey}`;
}

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

    const resolvedPreview = withApiKey(joinUrl(stashBase, preview ?? ""), apiKey);
    const resolvedShot = withApiKey(joinUrl(stashBase, screenshot ?? ""), apiKey);

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
    const MARKERS_TAG_ID = 3104;

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
    const baseVars = { actorId, hasMarkers, pageNumber, perPage };
    const withTagVars = {
        actorId,
        hasMarkers,
        markersOrganisedIds: [MARKERS_TAG_ID],
        pageNumber,
        perPage,
    };

    const {
        data: dataBase,
        loading: loadingBase,
        error: errorBase,
    } = useQuery(GET_ACTOR_SCENES_BASE, {
        variables: baseVars,
        skip: markersOrganised, // skip when tag filter is enabled
        fetchPolicy: "cache-and-network",
    });

    const {
        data: dataTagged,
        loading: loadingTagged,
        error: errorTagged,
    } = useQuery(GET_ACTOR_SCENES_WITH_TAG, {
        variables: withTagVars,
        skip: !markersOrganised, // skip when tag filter is disabled
        fetchPolicy: "cache-and-network",
    });

    const loading = markersOrganised ? loadingTagged : loadingBase;
    const error = markersOrganised ? errorTagged : errorBase;
    const scenes =
        (markersOrganised ? dataTagged?.findScenes?.scenes : dataBase?.findScenes?.scenes) ?? [];

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
                        component="a"
                    >
                        Markers
                    </Button>
                </Link>
                <Link href={`/actors/${actorId}/scenes`} passHref>
                    <Button
                        size="sm"
                        variant={isScenesPage ? "solid" : "soft"} // current page highlighted
                        component="a"
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
                    onChange={(e) => setMarkersOrganised(e.target.checked)}
                />
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
