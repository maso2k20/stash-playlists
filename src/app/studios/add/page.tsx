// filepath: src/app/studios/add/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, gql } from "@apollo/client";
import { Search, X, Check, Plus, ArrowLeft } from "lucide-react";
import { useSettings } from "@/app/context/SettingsContext";
import { makeStashUrl, extractRelativePath } from "@/lib/urlUtils";

// ~1.6k studios is small enough to fetch once and search/paginate client-side.
const GET_ALL_STUDIOS = gql`
  query GetAllStudios {
    findStudios(filter: { per_page: -1, sort: "name", direction: ASC }) {
      studios {
        id
        name
        image_path
        parent_studio { id name }
        child_studios { id }
      }
    }
  }
`;

type StashStudio = {
  id: string;
  name: string;
  image_path?: string | null;
  parent_studio?: { id: string; name: string } | null;
  child_studios?: { id: string }[];
};

const PER_PAGE = 60;

export default function AddStudiosPage() {
  const [filter, setFilter] = useState("");
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [hideExisting, setHideExisting] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [addError, setAddError] = useState<string | null>(null);

  const settings = useSettings();
  const stashServer = String(settings["STASH_SERVER"] || "");
  const stashAPI = String(settings["STASH_API"] || "");

  // Load IDs already saved in the app DB
  useEffect(() => {
    fetch("/api/studios", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((saved: { id: string }[]) => setExistingIds(new Set(saved.map((s) => String(s.id)))))
      .catch((e) => console.error("Failed to load existing studios:", e));
  }, []);

  const { data, loading, error } = useQuery(GET_ALL_STUDIOS, { fetchPolicy: "cache-first" });

  const allStudios: StashStudio[] = useMemo(() => data?.findStudios?.studios ?? [], [data]);

  const filtered = useMemo(() => {
    const terms = filter.toLowerCase().split(/\s+/).filter(Boolean);
    return allStudios.filter((s) => {
      if (hideExisting && existingIds.has(String(s.id))) return false;
      if (!terms.length) return true;
      const hay = `${s.name} ${s.parent_studio?.name ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [allStudios, filter, hideExisting, existingIds]);

  useEffect(() => setPageNumber(1), [filter, hideExisting]);

  const maxPage = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const page = filtered.slice((pageNumber - 1) * PER_PAGE, pageNumber * PER_PAGE);

  const handleAdd = async (studio: StashStudio) => {
    setAddError(null);
    try {
      const res = await fetch("/api/studios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: studio.id,
          name: studio.name,
          image_path: studio.image_path ? extractRelativePath(studio.image_path) : null,
          parentName: studio.parent_studio?.name ?? null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setExistingIds((prev) => new Set(prev).add(String(studio.id)));
    } catch (e) {
      console.error(e);
      setAddError(`Could not add ${studio.name}.`);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-[26px] pt-[22px]">
        <div>
          <h2 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Add Studios</h2>
          <div className="con-count mt-1">
            {loading ? "…" : `${filtered.length} STUDIOS${hideExisting && existingIds.size ? ` · ${existingIds.size} ALREADY ADDED` : ""}`}
          </div>
        </div>
        <Link href="/studios" className="con-btn-ghost">
          <ArrowLeft size={13} strokeWidth={2.4} />
          Back to Studios
        </Link>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-[10px] px-[26px] pt-[18px]">
        <div className="relative max-w-[320px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2" style={{ color: "var(--con-faint)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="search studios or networks…"
            aria-label="Search studios"
            className="con-input w-full pl-[33px] pr-[30px]"
          />
          {filter && (
            <button onClick={() => setFilter("")} aria-label="Clear search"
              className="absolute right-[10px] top-1/2 -translate-y-1/2" style={{ color: "var(--con-muted)" }}>
              <X size={13} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setHideExisting((v) => !v)}
          className="flex items-center gap-[7px] rounded-[6px] px-[11px] py-[7px] text-[12px]"
          style={{
            background: "var(--well)",
            border: "1px solid var(--con-border)",
            color: hideExisting ? "var(--con-text-2)" : "var(--con-muted)",
          }}
        >
          <span
            className="flex h-[14px] w-[14px] items-center justify-center rounded-[4px]"
            style={hideExisting
              ? { background: "var(--accent-cyan)", color: "var(--accent-ink)" }
              : { border: "1px solid var(--con-border-faint)" }}
          >
            {hideExisting && <Check size={9} strokeWidth={4} />}
          </span>
          Hide already added
        </button>
        <div className="flex-1" />
        {maxPage > 1 && (
          <div className="flex items-center gap-2 font-mono text-[11px]" style={{ color: "var(--con-muted)" }}>
            <button disabled={pageNumber <= 1} onClick={() => setPageNumber((p) => p - 1)}
              style={{ color: pageNumber <= 1 ? "var(--con-faint)" : "var(--accent-cyan)" }}>PREV</button>
            <span>{pageNumber} / {maxPage}</span>
            <button disabled={pageNumber >= maxPage} onClick={() => setPageNumber((p) => p + 1)}
              style={{ color: pageNumber >= maxPage ? "var(--con-faint)" : "var(--accent-cyan)" }}>NEXT</button>
          </div>
        )}
      </div>

      {(error || addError) && (
        <p className="px-[26px] pt-4 text-[13px]" style={{ color: "var(--danger)" }}>
          {addError ?? error?.message}
        </p>
      )}

      {loading && (
        <div className="grid grid-cols-2 gap-[14px] px-[26px] pb-[26px] pt-5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-video animate-pulse rounded-[7px]"
              style={{ background: "var(--well)", border: "1px solid var(--con-border)" }} />
          ))}
        </div>
      )}

      {!loading && !error && page.length === 0 && (
        <div className="mx-[26px] mt-5 rounded-[7px] p-6 text-center"
          style={{ background: "var(--surface)", border: "1px solid var(--con-border)" }}>
          <div className="text-[14px] font-semibold">
            {filter ? `No studios match “${filter}”.` : "No studios left to add."}
          </div>
        </div>
      )}

      {!loading && page.length > 0 && (
        <div className="grid grid-cols-2 gap-[14px] px-[26px] pb-[26px] pt-5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {page.map((studio) => {
            const added = existingIds.has(String(studio.id));
            const logo = studio.image_path
              ? makeStashUrl(extractRelativePath(studio.image_path), stashServer, stashAPI)
              : "";
            const subCount = studio.child_studios?.length ?? 0;
            return (
              <div key={studio.id} className="con-card overflow-hidden">
                <div className="relative aspect-video" style={{ background: "var(--well)" }}>
                  {logo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={logo} alt={studio.name} loading="lazy" className="h-full w-full object-contain p-4" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-mono text-[24px]" style={{ color: "var(--con-faint)" }}>
                      {studio.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={added}
                    onClick={() => handleAdd(studio)}
                    className="absolute right-[6px] top-[6px] flex items-center gap-1 rounded-[5px] px-[8px] py-[3px] text-[11px] font-semibold"
                    style={added
                      ? { background: "rgba(8,10,12,0.82)", color: "var(--con-muted)", border: "1px solid var(--con-border-strong)" }
                      : { background: "var(--accent-cyan)", color: "var(--accent-ink)" }}
                  >
                    {added ? <Check size={11} strokeWidth={3} /> : <Plus size={11} strokeWidth={3} />}
                    {added ? "Added" : "Add"}
                  </button>
                </div>
                <div className="px-[10px] py-[8px] text-center">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium" title={studio.name}>
                    {studio.name}
                  </div>
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px]" style={{ color: "var(--con-faint)" }}>
                    {studio.parent_studio?.name ?? (subCount ? `${subCount} SUB-STUDIO${subCount === 1 ? "" : "S"}` : " ")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
