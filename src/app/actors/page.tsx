// filepath: src/app/actors/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSettings } from "@/app/context/SettingsContext";
import { makeStashUrl } from "@/lib/urlUtils";
import {
  Grid,
  Card,
  CardCover,
  CardContent,
  Typography,
  AspectRatio,
  Sheet,
  Skeleton,
  Box,
  Button,
  Input,
} from "@mui/joy";

type Actor = {
  id: string;
  name: string;
  image_path: string;
  rating: number;
  createdAt: string;
  updatedAt: string;
};

export default function MyActorsPage() {
  const [actors, setActors] = useState<Actor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const settings = useSettings();

  useEffect(() => {
    fetch("/api/actors", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Actor[]) => setActors(data))
      .catch((e) => setError(e.message));
  }, []);

  const sortedActors = useMemo(() => {
    if (!actors) return [];
    return actors
      .slice()
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
  }, [actors]);

  const filteredActors = useMemo(() => {
    if (!q.trim()) return sortedActors;
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return sortedActors.filter((a) => {
      const name = a.name.toLowerCase();
      return terms.every((t) => name.includes(t));
    });
  }, [sortedActors, q]);

  return (
    <Sheet sx={{ p: 2, maxWidth: 1600, mx: "auto" }}>
      {/* Header row: title left, controls (Add + Search) right */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          mb: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography level="h2" sx={{ flexGrow: 1 }}>
          Actors
        </Typography>

        <Box
          sx={{
            display: "flex",
            gap: 1,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search actors…"
            size="sm"
            sx={{ minWidth: { xs: 180, sm: 240 } }}
            slotProps={{
              input: { "aria-label": "Search actors" },
            }}
          />
          <Button component={Link} href="/actors/add" variant="solid" size="sm">
            + Add Actors
          </Button>
        </Box>
      </Box>

      {error && (
        <Typography level="body-sm" color="danger" sx={{ mb: 2 }}>
          Failed to load actors: {error}
        </Typography>
      )}

      {actors && filteredActors.length === 0 && (
        <Sheet
          variant="soft"
          color="neutral"
          sx={{
            p: 3,
            borderRadius: "lg",
            textAlign: "center",
          }}
        >
          <Typography level="title-md" sx={{ mb: 1 }}>
            No actors match “{q}”.
          </Typography>
          <Button size="sm" variant="plain" onClick={() => setQ("")}>
            Clear search
          </Button>
        </Sheet>
      )}

      {!actors && !error && (
        <Grid container spacing={2}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Grid key={i} xs={6} sm={4} md={3} lg={2}>
              <Card sx={{ borderRadius: "lg", overflow: "hidden" }}>
                <AspectRatio ratio="2/3">
                  <Skeleton />
                </AspectRatio>
                <CardContent>
                  <Skeleton variant="text" level="title-sm" />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {actors && filteredActors.length > 0 && (
        <Grid container spacing={2}>
          {filteredActors.map((actor) => (
            <Grid key={actor.id} xs={6} sm={4} md={3} lg={2}>
              <Link href={`/actors/${actor.id}`} style={{ textDecoration: "none" }}>
                <Card
                  sx={{
                    borderRadius: "lg",
                    overflow: "hidden",
                    p: 0,
                    boxShadow: "md",
                    transition: "transform 150ms ease, box-shadow 150ms ease",
                    "&:hover": {
                      transform: "translateY(-2px)",
                      boxShadow: "lg",
                    },
                  }}
                >
                  <AspectRatio ratio="2/3">
                    {/* Image */}
                    <CardCover>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={makeStashUrl(actor.image_path, String(settings["STASH_SERVER"] || ""), String(settings["STASH_API"] || ""))}
                        alt={actor.name}
                        style={{ objectFit: "cover" }}
                        loading="lazy"
                      />
                    </CardCover>

                    {/* Bottom-anchored name bar */}
                    <Box
                      sx={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        px: 1,
                        py: 0.5,
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.0) 80%)",
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
                  </AspectRatio>
                </Card>
              </Link>
            </Grid>
          ))}
        </Grid>
      )}
    </Sheet>
  );
}
