// src/app/page.tsx
"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useQuery, gql } from "@apollo/client";
import { useSettings } from "@/app/context/SettingsContext";
import { useStashTags } from "@/context/StashTagsContext";
import { makeStashUrl } from "@/lib/urlUtils";
import Link from "next/link";

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
  Skeleton,
  Input,
} from "@mui/joy";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";

// Query for unorganised scenes (scenes with markers but without "Markers Organised" tag)
const GET_UNORGANISED_SCENES = gql`
  query getUnorganisedScenes(
    $markersOrganisedIds: [ID!]!
    $pageNumber: Int!
    $perPage: Int!
  ) {
    findScenes(
      scene_filter: {
        has_markers: "true"
        tags: { modifier: EXCLUDES, value: $markersOrganisedIds }
      }
      filter: { page: $pageNumber, per_page: $perPage }
    ) {
      count
      scenes {
        id
        title
        paths { screenshot }
        performers { id name }
      }
    }
  }
`;

// Query with title filter
const GET_UNORGANISED_SCENES_FILTERED = gql`
  query getUnorganisedScenesFiltered(
    $markersOrganisedIds: [ID!]!
    $titleQuery: String!
  ) {
    findScenes(
      scene_filter: {
        has_markers: "true"
        tags: { modifier: EXCLUDES, value: $markersOrganisedIds }
        title: { value: $titleQuery, modifier: INCLUDES }
      }
      filter: { per_page: -1 }
    ) {
      count
      scenes {
        id
        title
        paths { screenshot }
        performers { id name }
      }
    }
  }
`;

type Scene = {
  id: string;
  title: string;
  paths?: { screenshot?: string };
  performers?: { id: string; name: string }[];
};

// Pagination controls component
function PaginationControls({
  pageNumber,
  perPage,
  totalCount,
  onPageChange,
  sx = {}
}: {
  pageNumber: number;
  perPage: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  sx?: Record<string, unknown>;
}) {
  const maxPage = Math.ceil(totalCount / perPage);

  return (
    <Box sx={{ display: "flex", justifyContent: "center", gap: 1, alignItems: "center", ...sx }}>
      <Button
        size="sm"
        variant="plain"
        disabled={pageNumber <= 1}
        onClick={() => onPageChange(pageNumber - 1)}
      >
        Previous
      </Button>

      {[pageNumber - 2, pageNumber - 1, pageNumber, pageNumber + 1, pageNumber + 2]
        .filter((n) => n >= 1 && n <= maxPage)
        .map((n) => (
          <Chip
            key={n}
            variant={n === pageNumber ? "solid" : "soft"}
            color={n === pageNumber ? "primary" : "neutral"}
            size="sm"
            onClick={() => onPageChange(n)}
            sx={{ cursor: "pointer" }}
          >
            {n}
          </Chip>
        ))}

      <Button
        size="sm"
        variant="plain"
        disabled={pageNumber >= maxPage}
        onClick={() => onPageChange(pageNumber + 1)}
      >
        Next
      </Button>
    </Box>
  );
}

function HoverPreview({
  screenshot,
  alt,
  stashBase,
  apiKey,
}: {
  screenshot?: string;
  alt: string;
  stashBase?: string;
  apiKey?: string;
}) {
  const resolvedShot = makeStashUrl(screenshot, stashBase, apiKey);

  return (
    <Box sx={{ position: "relative", width: "100%", height: "100%", outline: "none" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedShot || ""}
        alt={alt}
        loading="lazy"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          pointerEvents: "none",
        }}
      />
    </Box>
  );
}

function HomeContent() {
  // Pagination state
  const [pageNumber, setPageNumber] = useState(1);
  const perPage = 42;
  const [totalCount, setTotalCount] = useState(0);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");

  const settings = useSettings();
  const stashServer = settings["STASH_SERVER"];
  const stashAPI = settings["STASH_API"];

  const { stashTags, loading: tagsLoading, error: tagsError } = useStashTags();

  // Find "Markers Organised" tag ID
  const markersOrganisedTagId = useMemo(() => {
    const tag = stashTags?.find((t: { id: string; name: string }) => t.name === "Markers Organised");
    return tag?.id ? String(tag.id) : null;
  }, [stashTags]);

  // Determine if we're filtering
  const isFiltering = searchTerm.trim().length > 0;

  // Scroll to top on page change
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [pageNumber]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPageNumber(1);
  }, [searchTerm]);

  // Query variables for paginated (non-filtered) query
  const paginatedVariables = useMemo(() => ({
    markersOrganisedIds: markersOrganisedTagId ? [markersOrganisedTagId] : [],
    pageNumber,
    perPage,
  }), [markersOrganisedTagId, pageNumber, perPage]);

  // Query variables for filtered query
  const filteredVariables = useMemo(() => ({
    markersOrganisedIds: markersOrganisedTagId ? [markersOrganisedTagId] : [],
    titleQuery: searchTerm.trim(),
  }), [markersOrganisedTagId, searchTerm]);

  // Paginated query - skip when filtering or tag not found
  const { data: paginatedData, loading: paginatedLoading, error: paginatedError } = useQuery(GET_UNORGANISED_SCENES, {
    variables: paginatedVariables,
    skip: !markersOrganisedTagId || isFiltering,
    fetchPolicy: "cache-and-network",
  });

  // Filtered query - only run when filtering
  const { data: filteredData, loading: filteredLoading, error: filteredError } = useQuery(GET_UNORGANISED_SCENES_FILTERED, {
    variables: filteredVariables,
    skip: !markersOrganisedTagId || !isFiltering,
    fetchPolicy: "cache-and-network",
  });

  // Select appropriate data based on mode
  const data = isFiltering ? filteredData : paginatedData;
  const loading = isFiltering ? filteredLoading : paginatedLoading;
  const error = isFiltering ? filteredError : paginatedError;

  // Extract scenes and update total count
  const scenes: Scene[] = useMemo(() => {
    return data?.findScenes?.scenes || [];
  }, [data]);

  useEffect(() => {
    if (data?.findScenes?.count !== undefined) {
      setTotalCount(data.findScenes.count);
    }
  }, [data]);

  const anyLoading = loading || tagsLoading;
  const maxPage = Math.ceil(totalCount / perPage);

  // Tag not found state
  if (!tagsLoading && !markersOrganisedTagId) {
    return (
      <Sheet sx={{ p: 2, maxWidth: "90vw", mx: "auto" }}>
        <Box sx={{ mb: 2 }}>
          <Typography level="h2" sx={{ mb: 1 }}>
            Unorganised Scenes
          </Typography>
        </Box>
        <Sheet
          variant="soft"
          color="warning"
          sx={{ p: 3, borderRadius: "lg", textAlign: "center" }}
        >
          <Typography level="title-md">
            &quot;Markers Organised&quot; tag not found in Stash
          </Typography>
          <Typography level="body-sm" sx={{ mt: 1 }}>
            Create a tag named &quot;Markers Organised&quot; in your Stash server to enable this feature.
          </Typography>
        </Sheet>
      </Sheet>
    );
  }

  return (
    <Sheet sx={{ p: 2, maxWidth: "90vw", mx: "auto" }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2, mb: 1 }}>
          <Typography level="h2">
            Unorganised Scenes
          </Typography>
          <Input
            size="sm"
            placeholder="Search by title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            startDecorator={<SearchIcon sx={{ fontSize: 18 }} />}
            endDecorator={
              searchTerm && (
                <ClearIcon
                  sx={{ fontSize: 16, cursor: "pointer", opacity: 0.6, "&:hover": { opacity: 1 } }}
                  onClick={() => setSearchTerm("")}
                />
              )
            }
            sx={{ width: 250 }}
          />
        </Box>
        {!anyLoading && totalCount > 0 && (
          <Typography level="body-sm" color="neutral">
            {isFiltering ? (
              <>{totalCount} scene{totalCount === 1 ? '' : 's'} matching &quot;{searchTerm}&quot;</>
            ) : (
              <>Page {pageNumber} of {maxPage} &bull; {totalCount} scene{totalCount === 1 ? '' : 's'} with markers need organising</>
            )}
          </Typography>
        )}
      </Box>

      {/* Top Pagination Controls - only show when browsing (not filtering) */}
      {!anyLoading && !isFiltering && scenes.length > 0 && totalCount > perPage && (
        <PaginationControls
          pageNumber={pageNumber}
          perPage={perPage}
          totalCount={totalCount}
          onPageChange={setPageNumber}
          sx={{ mb: 2 }}
        />
      )}

      {/* Loading skeletons */}
      {anyLoading && (
        <Grid container spacing={2}>
          {Array.from({ length: 12 }).map((_, i) => (
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

      {/* Error state */}
      {!anyLoading && (error || tagsError) && (
        <Typography color="danger" level="body-sm" sx={{ mb: 2 }}>
          {error?.message || tagsError}
        </Typography>
      )}

      {/* Empty state */}
      {!anyLoading && !error && scenes.length === 0 && totalCount === 0 && (
        <Box
          sx={{
            p: 3,
            borderRadius: "lg",
            textAlign: "center",
            border: "1px dashed",
            borderColor: "neutral.outlinedBorder",
            bgcolor: "background.level1",
          }}
        >
          {isFiltering ? (
            <>
              <Typography level="title-md">No scenes match &quot;{searchTerm}&quot;</Typography>
              <Typography level="body-sm" sx={{ mt: 1, color: "text.secondary" }}>
                Try a different search term or{" "}
                <Button variant="plain" size="sm" onClick={() => setSearchTerm("")}>
                  clear the filter
                </Button>
              </Typography>
            </>
          ) : (
            <>
              <Typography level="title-md">There are no unorganised scenes</Typography>
              <Typography level="body-sm" sx={{ mt: 1, color: "text.secondary" }}>
                All scenes with markers have been organised.
              </Typography>
            </>
          )}
        </Box>
      )}

      {/* Scene Cards */}
      {!anyLoading && scenes.length > 0 && (
        <Grid container spacing={2}>
          {scenes.map((scene: Scene) => (
            <Grid key={scene.id} xs={12} sm={6} md={4} lg={3} xl={2}>
              <Link href={`/scenes/${scene.id}`} style={{ textDecoration: "none" }}>
                <Card
                  sx={{
                    p: 0,
                    overflow: "hidden",
                    borderRadius: "lg",
                    position: "relative",
                    boxShadow: "sm",
                    transition: "transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease",
                    border: "2px solid transparent",
                    "&:hover": {
                      transform: "translateY(-2px)",
                      boxShadow: "md",
                      borderColor: "primary.200",
                    },
                    cursor: "pointer",
                  }}
                >
                  <AspectRatio ratio="16/9">
                    <CardCover sx={{ pointerEvents: "auto" }}>
                      <HoverPreview
                        screenshot={scene.paths?.screenshot}
                        alt={scene.title}
                        stashBase={stashServer}
                        apiKey={stashAPI}
                      />
                    </CardCover>

                    {/* Performers chips (top-left) */}
                    {scene.performers && scene.performers.length > 0 && (
                      <Box
                        sx={{
                          position: "absolute",
                          top: 8,
                          left: 8,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 0.5,
                          maxWidth: "calc(100% - 16px)",
                        }}
                      >
                        {scene.performers.slice(0, 2).map((performer) => (
                          <Chip
                            key={performer.id}
                            size="sm"
                            variant="soft"
                            sx={{
                              backgroundColor: "rgba(0, 0, 0, 0.7)",
                              color: "#fff",
                              backdropFilter: "blur(4px)",
                              border: "1px solid rgba(255, 255, 255, 0.2)",
                              fontSize: "0.75rem",
                            }}
                          >
                            {performer.name}
                          </Chip>
                        ))}
                        {scene.performers.length > 2 && (
                          <Chip
                            size="sm"
                            variant="soft"
                            sx={{
                              backgroundColor: "rgba(0, 0, 0, 0.7)",
                              color: "#fff",
                              backdropFilter: "blur(4px)",
                              border: "1px solid rgba(255, 255, 255, 0.2)",
                              fontSize: "0.75rem",
                            }}
                          >
                            +{scene.performers.length - 2}
                          </Chip>
                        )}
                      </Box>
                    )}

                    {/* Bottom gradient + title */}
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
          ))}
        </Grid>
      )}

      {/* Bottom Pagination Controls - only show when browsing (not filtering) */}
      {!anyLoading && !isFiltering && scenes.length > 0 && totalCount > perPage && (
        <PaginationControls
          pageNumber={pageNumber}
          perPage={perPage}
          totalCount={totalCount}
          onPageChange={setPageNumber}
          sx={{ mt: 3 }}
        />
      )}
    </Sheet>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <Sheet sx={{ p: 2, maxWidth: "90vw", mx: "auto" }}>
        <Box sx={{ mb: 2 }}>
          <Typography level="h2" sx={{ mb: 1 }}>
            Unorganised Scenes
          </Typography>
        </Box>
        <Grid container spacing={2}>
          {Array.from({ length: 12 }).map((_, i) => (
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
      </Sheet>
    }>
      <HomeContent />
    </Suspense>
  );
}
