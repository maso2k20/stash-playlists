// filepath: src/app/studios/page.tsx
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

type Studio = {
  id: string;
  name: string;
  image_path: string | null;
  parentName: string | null;
  markerCount: number;
  unorganisedSceneCount: number;
  countsUpdatedAt: string | null;
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

const STUDIOS_PREFS_KEY = "studiosPagePrefs";
const STUDIOS_REFRESH_KEY = "studiosCountsLastRefresh";

const SORT_LABELS: Record<SortOption, string> = {
  "name-asc": "Name (A–Z)",
  "name-desc": "Name (Z–A)",
  "markers-desc": "Most Markers",
  "markers-asc": "Fewest Markers",
  "outstanding-desc": "Most Outstanding",
  "outstanding-asc": "Fewest Outstanding",
};

/** Token-styled toggle pill with a checkbox square (matches the Actors controls). */
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

export default function MyStudiosPage() {
  const [studios, setStudios] = useState<Studio[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [needsOrganising, setNeedsOrganising] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const settings = useSettings();

  useEffect(() => {
    fetch("/api/studios", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Studio[]) => setStudios(data))
      .catch((e) => setError(e.message));
  }, []);

  // Refresh the precomputed counts from Stash in the background, then re-fetch
  // so the badges update in place. Throttled like the Actors page.
  useEffect(() => {
    const THROTTLE_MS = 30_000;
    let cancelled = false;
    try {
      const last = Number(sessionStorage.getItem(STUDIOS_REFRESH_KEY) || 0);
      if (Date.now() - last < THROTTLE_MS) return;
      sessionStorage.setItem(STUDIOS_REFRESH_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }

    setRefreshing(true);
    fetch("/api/studios/counts", { method: "POST" })
      .then(() => fetch("/api/studios", { cache: "no-store" }))
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Studio[] | null) => {
        if (data && !cancelled) setStudios(data);
      })
      .catch(() => {
        /* leave cached counts in place on failure */
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Restore / persist search, sort and filter (session-scoped).
  const prefsHydrated = useRef(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STUDIOS_PREFS_KEY);
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
      sessionStorage.setItem(STUDIOS_PREFS_KEY, JSON.stringify({ q, sortBy, needsOrganising }));
    } catch {
      /* ignore */
    }
  }, [q, sortBy, needsOrganising]);

  const filteredStudios = useMemo(() => {
    if (!studios) return [];
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);

    const list = studios.filter((s) => {
      if (needsOrganising && !(s.unorganisedSceneCount > 0)) return false;
      if (terms.length) {
        const name = `${s.name} ${s.parentName ?? ""}`.toLowerCase();
        if (!terms.every((t) => name.includes(t))) return false;
      }
      return true;
    });

    const byName = (a: Studio, b: Studio) =>
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
  }, [studios, q, sortBy, needsOrganising]);

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-[26px] pt-[22px]">
        <div>
          <h2 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Studios</h2>
          <div className="con-count mt-1">
            {studios
              ? filteredStudios.length === studios.length
                ? `${studios.length} STUDIOS`
                : `${filteredStudios.length} OF ${studios.length} STUDIOS`
              : "…"}
            {refreshing && (
              <span style={{ color: "var(--con-faint)" }}> · UPDATING…</span>
            )}
          </div>
        </div>
        <Link href="/studios/add" className="con-btn-primary">
          <Plus size={13} strokeWidth={2.6} />
          Add Studios
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
            placeholder="search studios…"
            aria-label="Search studios"
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
          Failed to load studios: {error}
        </p>
      )}

      {/* Empty states */}
      {studios && studios.length === 0 && (
        <div className="mx-[26px] mt-5 rounded-[7px] p-6 text-center"
          style={{ background: "var(--surface)", border: "1px dashed var(--con-border-strong)" }}>
          <div className="mb-1 text-[14px] font-semibold">No studios added yet</div>
          <div className="text-[13px]" style={{ color: "var(--con-muted)" }}>
            Added studios (and their sub-studios) count towards Unorganised Scenes.
          </div>
        </div>
      )}
      {studios && studios.length > 0 && filteredStudios.length === 0 && (
        <div className="mx-[26px] mt-5 rounded-[7px] p-6 text-center"
          style={{ background: "var(--surface)", border: "1px solid var(--con-border)" }}>
          <div className="mb-2 text-[14px] font-semibold">No studios match “{q}”.</div>
          <button onClick={() => setQ("")} className="text-[13px]" style={{ color: "var(--accent-cyan)" }}>
            Clear search
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {!studios && !error && (
        <div className="grid grid-cols-2 gap-[14px] px-[26px] pb-[26px] pt-5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-[7px]"
              style={{ border: "1px solid var(--con-border)", background: "var(--surface)" }}>
              <div className="aspect-video animate-pulse" style={{ background: "var(--well)" }} />
              <div className="p-[9px]">
                <div className="mx-auto h-3 w-2/3 animate-pulse rounded" style={{ background: "var(--well)" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      {studios && filteredStudios.length > 0 && (
        <div className="grid grid-cols-2 gap-[14px] px-[26px] pb-[26px] pt-5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {filteredStudios.map((studio) => {
            const logo = makeStashUrl(
              studio.image_path,
              String(settings["STASH_SERVER"] || ""),
              String(settings["STASH_API"] || "")
            );
            return (
              <Link
                key={studio.id}
                href={`/studios/${studio.id}`}
                className="con-card group block overflow-hidden no-underline"
              >
                <div className="relative aspect-video" style={{ background: "var(--well)" }}>
                  {logo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={logo}
                      alt={studio.name}
                      className="h-full w-full object-contain p-4"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center font-mono text-[28px]"
                      style={{ background: "linear-gradient(150deg,#1e2226,#15181b)", color: "var(--con-faint)" }}
                    >
                      {studio.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {studio.countsUpdatedAt != null && (
                    <span
                      className="absolute right-[6px] bottom-[6px] rounded-[5px] px-[6px] py-[2px] font-mono text-[11px] font-medium tabular-nums"
                      style={{
                        background: "rgba(8,10,12,0.82)",
                        color: "var(--con-text)",
                        border: "1px solid var(--con-border-strong)",
                      }}
                      title={`${studio.markerCount.toLocaleString()} markers`}
                    >
                      {studio.markerCount.toLocaleString()}
                    </span>
                  )}
                  {studio.unorganisedSceneCount > 0 && (
                    <span
                      className="absolute left-[6px] bottom-[6px] rounded-[5px] px-[6px] py-[2px] font-mono text-[11px] font-semibold tabular-nums"
                      style={{
                        background: "rgba(8,10,12,0.82)",
                        color: "#ff8b8b",
                        border: "1px solid rgba(224,128,128,0.7)",
                      }}
                      title={`${studio.unorganisedSceneCount.toLocaleString()} scenes still need organising`}
                    >
                      {studio.unorganisedSceneCount.toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="px-[10px] py-[9px] text-center">
                  <div
                    className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium"
                    style={{ color: "var(--con-text)" }}
                    title={studio.name}
                  >
                    {studio.name}
                  </div>
                  {studio.parentName && (
                    <div
                      className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px]"
                      style={{ color: "var(--con-faint)" }}
                      title={studio.parentName}
                    >
                      {studio.parentName}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
