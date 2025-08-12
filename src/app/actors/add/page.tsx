"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useQuery, gql } from "@apollo/client";
import {
  Sheet,
  Box,
  Typography,
  Input,
  Button,
  Grid,
  Card,
  CardCover,
  AspectRatio,
  Skeleton,
  Chip,
  Switch,
  Tooltip,
} from "@mui/joy";

const GET_ALL_PERFORMERS = gql`
  query GetAllPerformers($pageNumber: Int, $perPage: Int) {
    findPerformers(filter: { page: $pageNumber, per_page: $perPage }) {
      performers {
        id
        name
        image_path
        rating100
      }
      # If your server exposes totalCount, uncomment and wire it up:
      # totalCount
    }
  }
`;

const FILTER_PERFORMERS = gql`
  query filterPerformers($filter: String!) {
    findPerformers(
      performer_filter: { name: { value: $filter, modifier: INCLUDES } }
    ) {
      performers {
        id
        name
        image_path
        rating100
      }
    }
  }
`;

type Performer = {
  id: string;
  name: string;
  image_path: string;
  rating100: number;
};

type SavedActor = {
  id: string;
  name: string;
  image_path: string;
  rating: number;
};

export default function AddActorsPage() {
  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState(filter);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [hideExisting, setHideExisting] = useState(true);

  const [pageNumber, setPageNumber] = useState(1);
  const perPage = 40;

  // Load IDs already saved in your app DB
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch("/api/actors", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const saved: SavedActor[] = await r.json();
        if (!active) return;
        setExistingIds(new Set(saved.map((a) => a.id)));
      } catch (e) {
        console.error("Failed to load existing actors:", e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filter.trim()), 300);
    return () => clearTimeout(t);
  }, [filter]);

  const { data, loading, error } = useQuery(GET_ALL_PERFORMERS, {
    variables: { pageNumber, perPage },
    skip: !!debouncedFilter,
    fetchPolicy: "cache-and-network",
  });

  // For multi-word searches, we need a fallback strategy since server tokenizes
  const searchQuery = useMemo(() => {
    if (!debouncedFilter) return "";
    return debouncedFilter;
  }, [debouncedFilter]);

  const fallbackQuery = useMemo(() => {
    if (!debouncedFilter) return "";
    const words = debouncedFilter.trim().split(/\s+/);
    // If it's a multi-word search, use just the first word as fallback
    return words.length > 1 ? words[0] : "";
  }, [debouncedFilter]);

  const {
    data: filterData,
    loading: filterLoading,
    error: filterError,
  } = useQuery(FILTER_PERFORMERS, {
    variables: { filter: searchQuery },
    skip: !searchQuery,
    fetchPolicy: "cache-and-network",
  });

  const {
    data: fallbackData,
    loading: fallbackLoading,
    error: fallbackError,
  } = useQuery(FILTER_PERFORMERS, {
    variables: { filter: fallbackQuery },
    skip: !fallbackQuery,
    fetchPolicy: "cache-and-network",
  });

  const loadingAny = loading || filterLoading || fallbackLoading;
  const errorAny = error || filterError || fallbackError;

  const performersRaw: Performer[] = useMemo(() => {
    if (debouncedFilter) {
      const primaryResults = filterData?.findPerformers?.performers ?? [];
      const fallbackResults = fallbackData?.findPerformers?.performers ?? [];
      
      // Combine primary and fallback results, removing duplicates
      const combinedResults = [...primaryResults];
      const existingIds = new Set(primaryResults.map(p => p.id));
      
      for (const performer of fallbackResults) {
        if (!existingIds.has(performer.id)) {
          combinedResults.push(performer);
        }
      }
      
      return combinedResults;
    }
    return data?.findPerformers?.performers ?? [];
  }, [debouncedFilter, filterData, data, fallbackData]);

  // Apply client-side filtering for better search results
  const performersFiltered = useMemo(() => {
    if (!debouncedFilter) return performersRaw;
    
    const searchTerm = debouncedFilter.toLowerCase();
    
    // Filter and sort results to prioritize phrase matches over tokenized matches
    return performersRaw
      .filter((p) => {
        const name = p.name.toLowerCase();
        // Always include if the name contains the search term as a phrase
        if (name.includes(searchTerm)) return true;
        
        // For tokenized results (when server splits on spaces), 
        // only include if all search tokens appear in the name
        const searchTokens = searchTerm.split(/\s+/).filter(t => t.length > 0);
        return searchTokens.every(token => name.includes(token));
      })
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        
        // Prioritize exact matches
        if (aName === searchTerm && bName !== searchTerm) return -1;
        if (bName === searchTerm && aName !== searchTerm) return 1;
        
        // Then prioritize phrase matches (contains search term as continuous text)
        const aContainsPhrase = aName.includes(searchTerm);
        const bContainsPhrase = bName.includes(searchTerm);
        
        if (aContainsPhrase && !bContainsPhrase) return -1;
        if (bContainsPhrase && !aContainsPhrase) return 1;
        
        // Then prioritize names that start with the search term
        const aStarts = aName.startsWith(searchTerm);
        const bStarts = bName.startsWith(searchTerm);
        
        if (aStarts && !bStarts) return -1;
        if (bStarts && !aStarts) return 1;
        
        // Finally, sort alphabetically
        return aName.localeCompare(bName);
      });
  }, [performersRaw, debouncedFilter]);

  // Apply "hide existing" filter
  const performers = useMemo(() => {
    if (!hideExisting) return performersFiltered;
    const filtered = performersFiltered.filter((p) => !existingIds.has(p.id));
    return filtered;
  }, [performersFiltered, hideExisting, existingIds]);

  // For pagination when not filtering by name:
  // We don't know totalCount reliably; use a heuristic:
  const canGoPrev = pageNumber > 1 && !debouncedFilter;
  const canGoNext =
    !debouncedFilter &&
    // If the source page has fewer than perPage, assume we're at the end
    performersRaw.length === perPage;

  const hiddenCount = performersFiltered.length - performers.length;

  const handleAdd = async (actor: Performer) => {
    try {
      const res = await fetch("/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: actor.id,
          name: actor.name,
          image_path: actor.image_path,
          rating: actor.rating100 ?? 0,
        }),
      });
      if (!res.ok) throw new Error("Failed to add actor");
      // Mark added locally
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.add(actor.id);
        return next;
      });
      // Also mark as "existing" so it disappears if hideExisting is on
      setExistingIds((prev) => {
        const next = new Set(prev);
        next.add(actor.id);
        return next;
      });
    } catch (e) {
      console.error(e);
      alert("Could not add actor.");
    }
  };

  return (
    <Sheet sx={{ p: 2, maxWidth: 1600, mx: "auto" }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography level="h2" sx={{ flexGrow: 1 }}>
          Add Actors
        </Typography>
        <Button component={Link} href="/actors" variant="soft" size="sm">
          ← Back to Actors
        </Button>
      </Box>

      {/* Controls: search, hide toggle, pagination */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 2,
          flexWrap: "wrap",
        }}
      >
        <Input
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPageNumber(1); // reset on search
          }}
          placeholder="Search performers…"
          size="sm"
          sx={{ minWidth: { xs: 220, sm: 320 }, flexGrow: 1 }}
          slotProps={{ input: { "aria-label": "Search performers" } }}
        />

        <Tooltip title="Hide performers you've already added to your app">
          <Switch
            checked={hideExisting}
            onChange={(e) => setHideExisting(e.target.checked)}
            size="sm"
            endDecorator="Hide already added"
          />
        </Tooltip>

        {hideExisting && hiddenCount > 0 && (
          <Chip variant="soft" size="sm" color="neutral">
            {hiddenCount} hidden
          </Chip>
        )}

        {!debouncedFilter && (
          <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
            <Button
              size="sm"
              variant="plain"
              disabled={!canGoPrev}
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            {[pageNumber - 2, pageNumber - 1, pageNumber, pageNumber + 1, pageNumber + 2]
              .filter((n) => n >= 1)
              .map((n) => (
                <Chip
                  key={n}
                  variant={n === pageNumber ? "solid" : "soft"}
                  color={n === pageNumber ? "primary" : "neutral"}
                  size="sm"
                  onClick={() => setPageNumber(n)}
                >
                  {n}
                </Chip>
              ))}
            <Button
              size="sm"
              variant="plain"
              disabled={!canGoNext}
              onClick={() => setPageNumber((p) => p + 1)}
            >
              Next
            </Button>
          </Box>
        )}
      </Box>

      {/* Errors */}
      {errorAny && (
        <Typography level="body-sm" color="danger" sx={{ mb: 2 }}>
          {errorAny.message}
        </Typography>
      )}

      {/* Loading */}
      {loadingAny && (
        <Grid container spacing={2}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Grid key={i} xs={6} sm={4} md={3} lg={2}>
              <Card sx={{ borderRadius: "lg", overflow: "hidden" }}>
                <AspectRatio ratio="2/3">
                  <Skeleton />
                </AspectRatio>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Empty state */}
      {!loadingAny && performers.length === 0 && (
        <Sheet
          variant="soft"
          color="neutral"
          sx={{ p: 3, borderRadius: "lg", textAlign: "center" }}
        >
          <Typography level="title-md" sx={{ mb: 1 }}>
            {debouncedFilter
              ? `No results for “${debouncedFilter}”.`
              : hideExisting
              ? "No performers to add on this page."
              : "No performers found."}
          </Typography>
          {debouncedFilter && (
            <Button size="sm" variant="plain" onClick={() => setFilter("")}>
              Clear search
            </Button>
          )}
        </Sheet>
      )}

      {/* Results */}
      {!loadingAny && performers.length > 0 && (
        <Grid container spacing={2}>
          {performers.map((actor) => {
            const isAdded = addedIds.has(actor.id) || existingIds.has(actor.id);
            return (
              <Grid key={actor.id} xs={6} sm={4} md={3} lg={2}>
                <Card
                  sx={{
                    borderRadius: "lg",
                    overflow: "hidden",
                    p: 0,
                    boxShadow: "md",
                    position: "relative",
                    transition: "transform 150ms ease, box-shadow 150ms ease",
                    "&:hover": { transform: "translateY(-2px)", boxShadow: "lg" },
                  }}
                >
                  <AspectRatio ratio="2/3">
                    <CardCover>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={actor.image_path}
                        alt={actor.name}
                        style={{ objectFit: "cover" }}
                        loading="lazy"
                      />
                    </CardCover>

                    {/* Name bar (bottom) */}
                    <Box
                      sx={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        px: 1,
                        py: 0.5,
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 80%)",
                      }}
                    >
                      <Typography
                        level="title-sm"
                        sx={{
                          color: "#fff",
                          textAlign: "center",
                          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                        }}
                        title={actor.name}
                      >
                        {actor.name}
                      </Typography>
                    </Box>

                    {/* Add button (top-right) */}
                    <Box sx={{ position: "absolute", top: 8, right: 8 }}>
                      <Button
                        size="sm"
                        variant={isAdded ? "soft" : "solid"}
                        color={isAdded ? "neutral" : "success"}
                        disabled={isAdded}
                        onClick={(e) => {
                          e.preventDefault(); // keep on page
                          handleAdd(actor);
                        }}
                      >
                        {isAdded ? "Added" : "Add"}
                      </Button>
                    </Box>
                  </AspectRatio>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Bottom pagination */}
      {!debouncedFilter && !loadingAny && performersRaw.length > 0 && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            gap: 1,
            mt: 3,
            alignItems: "center",
          }}
        >
          <Button
            size="sm"
            variant="plain"
            disabled={!canGoPrev}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          {[pageNumber - 2, pageNumber - 1, pageNumber, pageNumber + 1, pageNumber + 2]
            .filter((n) => n >= 1)
            .map((n) => (
              <Chip
                key={n}
                variant={n === pageNumber ? "solid" : "soft"}
                color={n === pageNumber ? "primary" : "neutral"}
                size="sm"
                onClick={() => setPageNumber(n)}
              >
                {n}
              </Chip>
            ))}
          <Button
            size="sm"
            variant="plain"
            disabled={!canGoNext}
            onClick={() => setPageNumber((p) => p + 1)}
          >
            Next
          </Button>
        </Box>
      )}
    </Sheet>
  );
}
