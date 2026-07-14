// filepath: src/app/actors/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, Plus, Check } from "lucide-react";
import { useSettings } from "@/app/context/SettingsContext";
import { makeStashUrl } from "@/lib/urlUtils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Actor = {
  id: string;
  name: string;
  image_path: string;
  rating: number;
  markerCount: number;
  unorganisedSceneCount: number;
  markerCountUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SortOption =
  | "name-asc"
  | "name-desc"
  | "markers-desc"
  | "markers-asc"
  | "outstanding-desc"
  | "outstanding-asc";

const ACTORS_PREFS_KEY = "actorsPagePrefs";

const SORT_LABELS: Record<SortOption, string> = {
  "name-asc": "Name (A–Z)",
  "name-desc": "Name (Z–A)",
  "markers-desc": "Most Markers",
  "markers-asc": "Fewest Markers",
  "outstanding-desc": "Most Outstanding",
  "outstanding-asc": "Fewest Outstanding",
};

/** Token-styled toggle pill with a checkbox square (matches the Playlists controls). */
function TogglePill({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-[7px] rounded-[6px] px-[11px] py-[7px] text-[12px]"
      style={{
        background: "var(--well)",
        border: "1px solid var(--con-border)",
        color: checked ? "var(--con-text-2)" : "var(--con-muted)",
      }}
    >
      <span
        className="flex h-[14px] w-[14px] items-center justify-center rounded-[4px]"
        style={
          checked
            ? { background: "var(--accent-cyan)", color: "var(--accent-ink)" }
            : { border: "1px solid var(--con-border-faint)" }
        }
      >
        {checked && <Check size={9} strokeWidth={4} />}
      </span>
      {label}
    </button>
  );
}

export default function MyActorsPage() {
  const [actors, setActors] = useState<Actor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [needsOrganising, setNeedsOrganising] = useState(false);
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

  // Restore the search / sort / filter controls when returning to the page,
  // then persist them on change (session-scoped).
  const prefsHydrated = useRef(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ACTORS_PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.q === "string") setQ(p.q);
        if (typeof p.sortBy === "string" && p.sortBy in SORT_LABELS) setSortBy(p.sortBy as SortOption);
        if (typeof p.needsOrganising === "boolean") setNeedsOrganising(p.needsOrganising);
      }
    } catch {
      /* ignore */
    }
    prefsHydrated.current = true;
  }, []);

  useEffect(() => {
    if (!prefsHydrated.current) return;
    try {
      sessionStorage.setItem(ACTORS_PREFS_KEY, JSON.stringify({ q, sortBy, needsOrganising }));
    } catch {
      /* ignore */
    }
  }, [q, sortBy, needsOrganising]);

  const filteredActors = useMemo(() => {
    if (!actors) return [];
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);

    const list = actors.filter((a) => {
      if (needsOrganising && !(a.unorganisedSceneCount > 0)) return false;
      if (terms.length) {
        const name = a.name.toLowerCase();
        if (!terms.every((t) => name.includes(t))) return false;
      }
      return true;
    });

    const byName = (a: Actor, b: Actor) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

    return list.slice().sort((a, b) => {
      switch (sortBy) {
        case "name-asc": return byName(a, b);
        case "name-desc": return byName(b, a);
        case "markers-desc": return b.markerCount - a.markerCount || byName(a, b);
        case "markers-asc": return a.markerCount - b.markerCount || byName(a, b);
        case "outstanding-desc": return b.unorganisedSceneCount - a.unorganisedSceneCount || byName(a, b);
        case "outstanding-asc": return a.unorganisedSceneCount - b.unorganisedSceneCount || byName(a, b);
        default: return 0;
      }
    });
  }, [actors, q, sortBy, needsOrganising]);

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-[26px] pt-[22px]">
        <div>
          <h2 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Actors</h2>
          <div className="con-count mt-1">
            {actors
              ? filteredActors.length === actors.length
                ? `${actors.length} PERFORMERS`
                : `${filteredActors.length} OF ${actors.length} PERFORMERS`
              : "…"}
          </div>
        </div>
        <Link href="/actors/add" className="con-btn-primary">
          <Plus size={13} strokeWidth={2.6} />
          Add Actors
        </Link>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-[10px] px-[26px] pt-[18px]">
        <div className="relative max-w-[260px] flex-1">
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
        <TogglePill label="Needs organising" checked={needsOrganising} onChange={setNeedsOrganising} />
        <div className="flex-1" />
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger
            className="h-auto gap-2 rounded-[6px] border-[var(--con-border)] bg-[var(--well)] px-3 py-2 font-mono text-[12px] text-[var(--con-text-2)]"
            style={{ minWidth: 180 }}
          >
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortOption[]).map((k) => (
              <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          {filteredActors.map((actor) => {
            const shot = makeStashUrl(
              actor.image_path,
              String(settings["STASH_SERVER"] || ""),
              String(settings["STASH_API"] || "")
            );
            return (
            <Link
              key={actor.id}
              href={`/actors/${actor.id}/playlists`}
              className="con-card group block overflow-hidden no-underline"
            >
              <div className="relative aspect-[3/4]" style={{ background: "var(--well)" }}>
                {shot ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={shot}
                    alt={actor.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center font-mono text-[28px]"
                    style={{ background: "linear-gradient(150deg,#1e2226,#15181b)", color: "var(--con-faint)" }}
                  >
                    {actor.name.charAt(0).toUpperCase()}
                  </div>
                )}
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
                {actor.unorganisedSceneCount > 0 && (
                  <span
                    className="absolute left-[6px] top-[6px] rounded-[5px] px-[6px] py-[2px] font-mono text-[11px] font-semibold tabular-nums"
                    style={{
                      background: "rgba(8,10,12,0.82)",
                      color: "#ff8b8b",
                      border: "1px solid rgba(224,128,128,0.7)",
                    }}
                    title={`${actor.unorganisedSceneCount.toLocaleString()} scenes still need organising`}
                  >
                    {actor.unorganisedSceneCount.toLocaleString()}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
