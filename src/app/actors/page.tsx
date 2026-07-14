// filepath: src/app/actors/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Plus } from "lucide-react";
import { useSettings } from "@/app/context/SettingsContext";
import { makeStashUrl } from "@/lib/urlUtils";

type Actor = {
  id: string;
  name: string;
  image_path: string;
  rating: number;
  markerCount: number;
  markerCountUpdatedAt: string | null;
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
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-[26px] pt-[22px]">
        <div>
          <h2 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Actors</h2>
          <div className="con-count mt-1">
            {actors ? `${actors.length} PERFORMERS` : "…"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-[220px]">
            <Search
              size={14}
              strokeWidth={2}
              className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2"
              style={{ color: "var(--con-faint)" }}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search actors…"
              aria-label="Search actors"
              className="con-input w-full pl-[33px]"
            />
          </div>
          <Link href="/actors/add" className="con-btn-primary">
            <Plus size={13} strokeWidth={2.6} />
            Add Actors
          </Link>
        </div>
      </div>

      {error && (
        <p className="px-[26px] pt-4 text-[13px]" style={{ color: "var(--danger)" }}>
          Failed to load actors: {error}
        </p>
      )}

      {/* Empty state */}
      {actors && filteredActors.length === 0 && (
        <div className="mx-[26px] mt-5 rounded-[7px] p-6 text-center"
          style={{ background: "var(--surface)", border: "1px solid var(--con-border)" }}>
          <div className="mb-2 text-[14px] font-semibold">No actors match “{q}”.</div>
          <button onClick={() => setQ("")} className="text-[13px]" style={{ color: "var(--accent-cyan)" }}>
            Clear search
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {!actors && !error && (
        <div className="grid grid-cols-2 gap-[14px] px-[26px] pb-[26px] pt-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-[7px]"
              style={{ border: "1px solid var(--con-border)", background: "var(--surface)" }}>
              <div className="aspect-[3/4] animate-pulse" style={{ background: "var(--well)" }} />
              <div className="p-[9px]">
                <div className="mx-auto h-3 w-2/3 animate-pulse rounded" style={{ background: "var(--well)" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      {actors && filteredActors.length > 0 && (
        <div className="grid grid-cols-2 gap-[14px] px-[26px] pb-[26px] pt-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filteredActors.map((actor) => (
            <Link
              key={actor.id}
              href={`/actors/${actor.id}/playlists`}
              className="con-card group block overflow-hidden no-underline"
            >
              <div className="relative aspect-[3/4]" style={{ background: "var(--well)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={makeStashUrl(
                    actor.image_path,
                    String(settings["STASH_SERVER"] || ""),
                    String(settings["STASH_API"] || "")
                  )}
                  alt={actor.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {actor.markerCountUpdatedAt != null && (
                  <span
                    className="absolute right-[6px] top-[6px] rounded-[5px] px-[6px] py-[2px] font-mono text-[11px] font-medium tabular-nums"
                    style={{
                      background: "rgba(8,10,12,0.82)",
                      color: "var(--con-text)",
                      border: "1px solid var(--con-border-strong)",
                    }}
                    title={`${actor.markerCount.toLocaleString()} markers`}
                  >
                    {actor.markerCount.toLocaleString()}
                  </span>
                )}
              </div>
              <div
                className="overflow-hidden text-ellipsis whitespace-nowrap px-[10px] py-[9px] text-center text-[12px] font-medium"
                style={{ color: "var(--con-text)" }}
                title={actor.name}
              >
                {actor.name}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
