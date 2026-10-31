// filepath: src/app/tags/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, gql } from "@apollo/client";
import { ArrowDown, ArrowUp, Check, Search, X } from "lucide-react";
import { useStashTags } from "@/context/StashTagsContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Filter = "all" | "enabled" | "disabled" | "new";
type SortKey = "name" | "markers" | "scenes";
type SortOption = `${SortKey}-${"asc" | "desc"}`;

// Marker usage per tag, fetched only on this page (kept out of the shared tag
// context so the app-wide tag query stays light).
const GET_TAG_MARKER_COUNTS = gql`
  query getTagMarkerCounts {
    findTags(filter: { per_page: -1 }) {
      tags { id scene_marker_count }
    }
  }
`;

type TagRow = {
  id: string;
  name: string;
  sceneCount: number;
  markerCount: number;
  childIds: string[];
  parents: string[]; // parent tag names
};

const PER_PAGE = 100;
const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  enabled: "Enabled",
  disabled: "Not enabled",
  new: "New",
};
const SORT_LABELS: Record<SortOption, string> = {
  "name-asc": "Name (A–Z)",
  "name-desc": "Name (Z–A)",
  "markers-desc": "Most Markers",
  "markers-asc": "Fewest Markers",
  "scenes-desc": "Most Scenes",
  "scenes-asc": "Fewest Scenes",
};

/** Checkbox square in the console style. */
function CheckSquare({ checked }: { checked: boolean }) {
  return (
    <span
      className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px]"
      style={
        checked
          ? { background: "var(--accent-cyan)", color: "var(--accent-ink)" }
          : { border: "1px solid var(--con-border-strong)" }
      }
    >
      {checked && <Check size={10} strokeWidth={4} />}
    </span>
  );
}

export default function TagsPage() {
  const { stashTags, loading, error, enabledTagIds, reviewedTagIds, selectionLoaded, refetchSelection } =
    useStashTags();

  // Local copy of the selection for instant toggling; synced from context.
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  useEffect(() => {
    setEnabled(new Set(enabledTagIds));
    setReviewed(new Set(reviewedTagIds));
  }, [enabledTagIds, reviewedTagIds]);

  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [hideUnused, setHideUnused] = useState(false);
  const [onlyOnMarkers, setOnlyOnMarkers] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [markingReviewed, setMarkingReviewed] = useState(false);

  // The filtered list is computed from a snapshot of the selection taken when
  // the filter changes, so toggling a tag doesn't make it vanish mid-click
  // (e.g. enabling a tag while viewing "Not enabled").
  const [snapshot, setSnapshot] = useState<{ enabled: Set<string>; reviewed: Set<string> }>({
    enabled: new Set(),
    reviewed: new Set(),
  });
  useEffect(() => {
    if (selectionLoaded) setSnapshot({ enabled: new Set(enabledTagIds), reviewed: new Set(reviewedTagIds) });
    // Re-snapshot only when the selection first loads or the filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionLoaded, filter]);

  const { data: markerData, loading: markerCountsLoading } = useQuery(GET_TAG_MARKER_COUNTS, {
    fetchPolicy: "cache-and-network",
  });
  const markerCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of markerData?.findTags?.tags ?? []) m.set(String(t.id), Number(t.scene_marker_count ?? 0));
    return m;
  }, [markerData]);

  const rows: TagRow[] = useMemo(() => {
    const parentNames = new Map<string, string[]>();
    for (const t of stashTags) {
      for (const c of t.children ?? []) {
        const id = String(c.id);
        parentNames.set(id, [...(parentNames.get(id) ?? []), String(t.name)]);
      }
    }
    return stashTags.map((t) => ({
      id: String(t.id),
      name: String(t.name),
      sceneCount: Number(t.scene_count ?? 0),
      markerCount: markerCounts.get(String(t.id)) ?? 0,
      childIds: (t.children ?? []).map((c: { id: string | number }) => String(c.id)),
      parents: parentNames.get(String(t.id)) ?? [],
    }));
  }, [stashTags, markerCounts]);

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const newCount = useMemo(() => rows.filter((r) => !reviewed.has(r.id)).length, [rows, reviewed]);
  // Tags on at least one marker (primary or other) that aren't enabled yet.
  const usedNotEnabled = useMemo(
    () => rows.filter((r) => r.markerCount > 0 && !enabled.has(r.id)).map((r) => r.id),
    [rows, enabled]
  );

  const visible = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = rows.filter((r) => {
      if (filter === "enabled" && !snapshot.enabled.has(r.id)) return false;
      if (filter === "disabled" && snapshot.enabled.has(r.id)) return false;
      if (filter === "new" && snapshot.reviewed.has(r.id)) return false;
      if (hideUnused && r.sceneCount === 0) return false;
      if (onlyOnMarkers && r.markerCount === 0) return false;
      if (terms.length) {
        const hay = `${r.name} ${r.parents.join(" ")}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    const byName = (a: TagRow, b: TagRow) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    const [key, dir] = sortBy.split("-") as [SortKey, "asc" | "desc"];
    const sign = dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      // Counts tie-break by name (always A–Z) so equal counts stay readable.
      if (key === "markers") return sign * (a.markerCount - b.markerCount) || byName(a, b);
      if (key === "scenes") return sign * (a.sceneCount - b.sceneCount) || byName(a, b);
      return sign * byName(a, b);
    });
  }, [rows, filter, snapshot, hideUnused, onlyOnMarkers, q, sortBy]);

  useEffect(() => setPageNumber(1), [filter, q, sortBy, hideUnused, onlyOnMarkers]);
  const maxPage = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const page = visible.slice((pageNumber - 1) * PER_PAGE, pageNumber * PER_PAGE);

  // Enable/disable tags: optimistic local update, persist, then refresh the
  // shared selection so the editors pick up the change.
  const setTags = async (ids: string[], value: boolean) => {
    setSaveError(null);
    const prevEnabled = enabled;
    const prevReviewed = reviewed;
    setEnabled((s) => {
      const next = new Set(s);
      ids.forEach((id) => (value ? next.add(id) : next.delete(id)));
      return next;
    });
    setReviewed((s) => new Set([...s, ...ids]));
    try {
      const r = await fetch("/api/tags/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", ids, enabled: value }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      refetchSelection();
    } catch (e) {
      setEnabled(prevEnabled);
      setReviewed(prevReviewed);
      setSaveError(`Could not save: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  };

  const markAllReviewed = async () => {
    setSaveError(null);
    setMarkingReviewed(true);
    try {
      const ids = rows.filter((r) => !reviewed.has(r.id)).map((r) => r.id);
      if (ids.length) {
        const r = await fetch("/api/tags/selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "markReviewed", ids }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      }
      await refetchSelection();
    } catch (e) {
      setSaveError(`Could not mark reviewed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setMarkingReviewed(false);
    }
  };

  const ready = !loading && selectionLoaded;

  const pager = maxPage > 1 && (
    <div className="flex items-center gap-2 font-mono text-[11px]" style={{ color: "var(--con-muted)" }}>
      <button disabled={pageNumber <= 1} onClick={() => setPageNumber((p) => p - 1)}
        style={{ color: pageNumber <= 1 ? "var(--con-faint)" : "var(--accent-cyan)" }}>PREV</button>
      <span>{pageNumber} / {maxPage}</span>
      <button disabled={pageNumber >= maxPage} onClick={() => setPageNumber((p) => p + 1)}
        style={{ color: pageNumber >= maxPage ? "var(--con-faint)" : "var(--accent-cyan)" }}>NEXT</button>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-[26px] pt-[22px]">
        <div>
          <h2 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Tags</h2>
          <div className="con-count mt-1">
            {ready ? (
              <>
                {rows.length.toLocaleString()} TAGS · {enabled.size.toLocaleString()} ENABLED
                {newCount > 0 && <span style={{ color: "var(--rating)" }}> · {newCount.toLocaleString()} NEW</span>}
              </>
            ) : "…"}
          </div>
          <div className="mt-2 max-w-[640px] text-[12px]" style={{ color: "var(--con-muted)" }}>
            Enabled tags are the only ones offered in Other Tags and Common Tags on the scene editor,
            the playlist player&apos;s tag editor and the smart playlist rules. With none enabled, every tag is offered.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ready && !markerCountsLoading && usedNotEnabled.length > 0 && (
            <button
              type="button"
              onClick={() => setTags(usedNotEnabled, true)}
              className="con-btn-primary"
              title="Enable every tag that is currently used on at least one marker"
            >
              <Check size={13} strokeWidth={2.6} />
              Enable {usedNotEnabled.length.toLocaleString()} tag{usedNotEnabled.length === 1 ? "" : "s"} used on markers
            </button>
          )}
          {ready && newCount > 0 && (
            <button type="button" onClick={markAllReviewed} disabled={markingReviewed} className="con-btn-ghost">
              <Check size={13} strokeWidth={2.6} />
              {markingReviewed ? "Marking…" : `Mark ${newCount.toLocaleString()} new as reviewed`}
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-[10px] px-[26px] pt-[18px]">
        <div className="flex overflow-hidden rounded-[6px]" style={{ border: "1px solid var(--con-border)" }}>
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="px-[11px] py-[7px] text-[12px]"
              style={filter === f
                ? { background: "var(--accent-cyan)", color: "var(--accent-ink)", fontWeight: 600 }
                : { background: "var(--well)", color: "var(--con-muted)" }}
            >
              {FILTER_LABELS[f]}
              {f === "new" && newCount > 0 && ` (${newCount})`}
            </button>
          ))}
        </div>
        <div className="relative min-w-[180px] max-w-[260px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2" style={{ color: "var(--con-faint)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search tags…"
            aria-label="Search tags"
            className="con-input w-full pl-[33px] pr-[30px]"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search"
              className="absolute right-[10px] top-1/2 -translate-y-1/2" style={{ color: "var(--con-muted)" }}>
              <X size={13} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setHideUnused((v) => !v)}
          className="flex items-center gap-[7px] rounded-[6px] px-[11px] py-[7px] text-[12px]"
          style={{
            background: "var(--well)",
            border: "1px solid var(--con-border)",
            color: hideUnused ? "var(--con-text-2)" : "var(--con-muted)",
          }}
        >
          <CheckSquare checked={hideUnused} />
          Hide tags with no scenes
        </button>
        <button
          type="button"
          onClick={() => setOnlyOnMarkers((v) => !v)}
          className="flex items-center gap-[7px] rounded-[6px] px-[11px] py-[7px] text-[12px]"
          style={{
            background: "var(--well)",
            border: "1px solid var(--con-border)",
            color: onlyOnMarkers ? "var(--con-text-2)" : "var(--con-muted)",
          }}
        >
          <CheckSquare checked={onlyOnMarkers} />
          Only used on markers
        </button>
        <div className="flex-1" />
        {pager}
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger
            className="h-auto gap-2 rounded-[6px] border-[var(--con-border)] bg-[var(--well)] px-3 py-2 font-mono text-[12px] text-[var(--con-text-2)]"
            style={{ minWidth: 160 }}
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

      {(error || saveError) && (
        <p className="px-[26px] pt-4 text-[13px]" style={{ color: "var(--danger)" }}>
          {saveError ?? `Failed to load tags: ${error?.message}`}
        </p>
      )}

      <div className="px-[26px] pb-[26px] pt-[16px]">
        {!ready && (
          <div className="flex flex-col gap-[6px]">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-[40px] animate-pulse rounded-[6px]" style={{ background: "var(--well)" }} />
            ))}
          </div>
        )}

        {ready && page.length === 0 && (
          <div className="rounded-[7px] p-6 text-center" style={{ background: "var(--surface)", border: "1px dashed var(--con-border-strong)" }}>
            <div className="text-[14px] font-semibold">
              {q ? `No tags match “${q}”.` : filter === "new" ? "No new tags — you're up to date." : "No tags here."}
            </div>
          </div>
        )}

        {ready && page.length > 0 && (
          <div className="overflow-hidden rounded-[7px]" style={{ border: "1px solid var(--con-border)" }}>
            <div className="flex items-center gap-3 px-[12px] py-[7px] font-mono text-[10px] tracking-[0.04em]"
              style={{ color: "var(--con-faint)", background: "var(--well)", borderBottom: "1px solid var(--divider)" }}>
              {([
                ["name", "TAG", "flex-1 justify-start"],
                ["markers", "MARKERS", "w-[64px] shrink-0 justify-end"],
                ["scenes", "SCENES", "w-[64px] shrink-0 justify-end"],
              ] as const).map(([key, label, cls]) => {
                const [activeKey, dir] = sortBy.split("-");
                const active = activeKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    // Same column flips direction; a new column starts A–Z for
                    // names and highest-first for counts.
                    onClick={() =>
                      setSortBy(
                        active
                          ? (`${key}-${dir === "asc" ? "desc" : "asc"}` as SortOption)
                          : (`${key}-${key === "name" ? "asc" : "desc"}` as SortOption)
                      )
                    }
                    className={`flex items-center gap-1 ${cls}`}
                    style={{ color: active ? "var(--accent-cyan)" : "var(--con-faint)" }}
                    title={`Sort by ${label.toLowerCase()}`}
                  >
                    {label}
                    {active && (dir === "asc" ? <ArrowUp size={10} strokeWidth={2.6} /> : <ArrowDown size={10} strokeWidth={2.6} />)}
                  </button>
                );
              })}
            </div>
            {page.map((r, i) => {
              const on = enabled.has(r.id);
              const isNew = !reviewed.has(r.id);
              const disabledChildren = r.childIds.filter((id) => !enabled.has(id));
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-[12px] py-[8px]"
                  style={{
                    background: on ? "var(--surface)" : "transparent",
                    borderTop: i === 0 ? "none" : "1px solid var(--divider)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setTags([r.id], !on)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-pressed={on}
                  >
                    <CheckSquare checked={on} />
                    <span className="min-w-0">
                      <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[13px]"
                        style={{ color: on ? "var(--con-text)" : "var(--con-text-2)", fontWeight: on ? 600 : 400 }}>
                        {r.name}
                        {isNew && (
                          <span className="ml-2 rounded-[4px] px-[5px] py-[1px] align-middle font-mono text-[9px] font-semibold"
                            style={{ color: "var(--rating)", border: "1px solid var(--rating-tint-bd)", background: "var(--rating-tint-bg)" }}>
                            NEW
                          </span>
                        )}
                      </span>
                      {r.parents.length > 0 && (
                        <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px]" style={{ color: "var(--con-faint)" }}>
                          in {r.parents.join(", ")}
                        </span>
                      )}
                    </span>
                  </button>
                  {r.childIds.length > 0 && (
                    disabledChildren.length > 0 || !on ? (
                      <button
                        type="button"
                        onClick={() => setTags([r.id, ...r.childIds.filter((id) => rowById.has(id))], true)}
                        className="shrink-0 rounded-[5px] px-[8px] py-[3px] font-mono text-[10px]"
                        style={{ border: "1px solid var(--con-border)", color: "var(--accent-cyan)" }}
                        title="Enable this tag and all of its child tags"
                      >
                        + {r.childIds.length} CHILD{r.childIds.length === 1 ? "" : "REN"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTags(r.childIds, false)}
                        className="shrink-0 rounded-[5px] px-[8px] py-[3px] font-mono text-[10px]"
                        style={{ border: "1px solid var(--con-border)", color: "var(--con-muted)" }}
                        title="Disable all of this tag's child tags (keeps this tag enabled)"
                      >
                        − {r.childIds.length} CHILD{r.childIds.length === 1 ? "" : "REN"}
                      </button>
                    )
                  )}
                  <span className="w-[64px] shrink-0 text-right font-mono text-[11px] tabular-nums"
                    style={{ color: r.markerCount > 0 ? "var(--con-text-2)" : "var(--con-faint)" }}
                    title={`${r.markerCount.toLocaleString()} markers`}>
                    {markerCountsLoading && !markerData ? "…" : r.markerCount.toLocaleString()}
                  </span>
                  <span className="w-[64px] shrink-0 text-right font-mono text-[11px] tabular-nums" style={{ color: "var(--con-muted)" }}
                    title={`${r.sceneCount.toLocaleString()} scenes`}>
                    {r.sceneCount.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {ready && pager && <div className="mt-4 flex justify-center">{pager}</div>}
      </div>
    </div>
  );
}
