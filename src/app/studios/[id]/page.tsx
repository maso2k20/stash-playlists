// filepath: src/app/studios/[id]/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, gql } from "@apollo/client";
import { ArrowLeft, Check, Search, Trash2, X } from "lucide-react";
import { useSettings } from "@/app/context/SettingsContext";
import { useStashTags } from "@/context/StashTagsContext";
import { makeStashUrl } from "@/lib/urlUtils";

// The scene filter is passed as a variable so the optional criteria (tag
// include/exclude, title) can be added or omitted without separate queries.
const GET_STUDIO_SCENES = gql`
  query findStudioScenes($sceneFilter: SceneFilterType, $pageNumber: Int, $perPage: Int) {
    findScenes(
      scene_filter: $sceneFilter
      filter: { page: $pageNumber, per_page: $perPage, sort: "date", direction: DESC }
    ) {
      count
      scenes {
        id
        title
        paths { screenshot }
        performers { id name }
        studio { id name }
        tags { id }
      }
    }
  }
`;

type Status = "unorganised" | "organised" | "all";

type Scene = {
  id: string;
  title: string;
  paths?: { screenshot?: string };
  performers?: { id: string; name: string }[];
  studio?: { id: string; name: string } | null;
  tags?: { id: string }[];
};

type Studio = {
  id: string;
  name: string;
  image_path: string | null;
  parentName: string | null;
  markerCount: number;
  unorganisedSceneCount: number;
  countsUpdatedAt: string | null;
};

const PER_PAGE = 60;
const STATUS_LABELS: Record<Status, string> = {
  unorganised: "Unorganised",
  organised: "Organised",
  all: "All",
};

function SceneCard({ scene, shot, organised, studioId }: { scene: Scene; shot: string; organised: boolean; studioId: string }) {
  // Show which sub-studio a scene belongs to when it isn't the studio itself.
  const subStudio = scene.studio && String(scene.studio.id) !== String(studioId) ? scene.studio.name : null;
  return (
    <Link href={`/scenes/${scene.id}`} className="group relative block aspect-video overflow-hidden rounded-[6px] no-underline"
      style={{ border: "1px solid var(--con-border)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" style={{ background: "var(--well)" }} />

      {/* Needs-organising amber dot (top-left) */}
      {!organised && (
        <span className="absolute left-[7px] top-[7px] z-10 h-[7px] w-[7px] rounded-full" style={{ background: "var(--rating)" }} />
      )}

      {/* Hover overlay: performers (top) + title (bottom) */}
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: "linear-gradient(to top,rgba(8,10,12,0.92) 0%,rgba(8,10,12,0.1) 45%,rgba(8,10,12,0.55) 100%)" }} />
      {scene.performers && scene.performers.length > 0 && (
        <div className="absolute left-[7px] top-[18px] z-10 flex max-w-[calc(100%-14px)] flex-wrap gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {scene.performers.slice(0, 2).map((p) => (
            <span key={p.id} className="rounded-[4px] px-[6px] py-[2px] text-[9px] text-white"
              style={{ background: "rgba(76,179,224,0.25)", border: "1px solid rgba(76,179,224,0.4)" }}>{p.name}</span>
          ))}
          {scene.performers.length > 2 && (
            <span className="rounded-[4px] px-[6px] py-[2px] text-[9px] text-white"
              style={{ background: "rgba(76,179,224,0.25)", border: "1px solid rgba(76,179,224,0.4)" }}>+{scene.performers.length - 2}</span>
          )}
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-2 pb-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold text-white" title={scene.title}>{scene.title}</div>
        {subStudio && (
          <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.7)" }}>{subStudio}</div>
        )}
      </div>
    </Link>
  );
}

function StudioScenesContent() {
  const { id: studioId } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Filter state is initialised from (and written back to) the URL so that
  // navigating into a scene and back restores it.
  const initialStatus = searchParams.get("status");
  const [status, setStatus] = useState<Status>(
    initialStatus === "organised" || initialStatus === "all" ? initialStatus : "unorganised"
  );
  const [hasMarkers, setHasMarkers] = useState(searchParams.get("hasMarkers") !== "false");
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") ?? "");
  const [pageNumber, setPageNumber] = useState(Math.max(1, Number(searchParams.get("page")) || 1));

  useEffect(() => {
    const params = new URLSearchParams();
    if (status !== "unorganised") params.set("status", status);
    if (!hasMarkers) params.set("hasMarkers", "false");
    if (searchTerm.trim()) params.set("q", searchTerm.trim());
    if (pageNumber > 1) params.set("page", String(pageNumber));
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [status, hasMarkers, searchTerm, pageNumber, pathname, router]);

  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pageNumber]);

  const settings = useSettings();
  const stashServer = settings["STASH_SERVER"];
  const stashAPI = settings["STASH_API"];

  // Studio record from the app DB (header info). A studio that isn't added
  // still browses fine — it just shows the Stash name from the first scene.
  const [studio, setStudio] = useState<Studio | null>(null);
  const [notAdded, setNotAdded] = useState(false);
  useEffect(() => {
    fetch(`/api/studios/${studioId}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) { setNotAdded(true); return; }
        if (r.ok) setStudio(await r.json());
      })
      .catch(() => {});
  }, [studioId]);

  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const handleRemove = async () => {
    setRemoving(true);
    try {
      const r = await fetch(`/api/studios?id=${encodeURIComponent(studioId)}`, { method: "DELETE" });
      if (r.ok) router.push("/studios");
    } finally {
      setRemoving(false);
    }
  };

  const { stashTags, loading: tagsLoading } = useStashTags();
  const organisedTagId = useMemo(() => {
    const tag = stashTags?.find((t: { id: string; name: string }) => t.name === "Markers Organised");
    return tag?.id ? String(tag.id) : null;
  }, [stashTags]);

  const sceneFilter = useMemo(() => {
    const f: Record<string, unknown> = {
      studios: { modifier: "INCLUDES", value: [studioId], depth: -1 },
      has_markers: hasMarkers ? "true" : "false",
    };
    if (organisedTagId && status !== "all") {
      f.tags = { modifier: status === "organised" ? "INCLUDES" : "EXCLUDES", value: [organisedTagId] };
    }
    if (searchTerm.trim()) f.title = { value: searchTerm.trim(), modifier: "INCLUDES" };
    return f;
  }, [studioId, hasMarkers, organisedTagId, status, searchTerm]);

  const { data, loading, error } = useQuery(GET_STUDIO_SCENES, {
    variables: { sceneFilter, pageNumber, perPage: PER_PAGE },
    // Wait for tags so the unorganised/organised filter is applied from the start.
    skip: tagsLoading,
    fetchPolicy: "cache-and-network",
  });

  const scenes: Scene[] = useMemo(() => data?.findScenes?.scenes ?? [], [data]);
  const totalCount: number = data?.findScenes?.count ?? 0;
  const maxPage = Math.max(1, Math.ceil(totalCount / PER_PAGE));
  const anyLoading = loading || tagsLoading;

  const title = studio?.name ?? scenes.find((s) => String(s.studio?.id) === String(studioId))?.studio?.name ?? "Studio";
  const logo = makeStashUrl(studio?.image_path, stashServer, stashAPI);

  const changeFilter = (fn: () => void) => {
    fn();
    setPageNumber(1);
  };

  const pager = !anyLoading && totalCount > PER_PAGE && (
    <div className="flex items-center justify-center gap-2 font-mono text-[11px]" style={{ color: "var(--con-muted)" }}>
      <button disabled={pageNumber <= 1} onClick={() => setPageNumber((p) => p - 1)}
        style={{ color: pageNumber <= 1 ? "var(--con-faint)" : "var(--accent-cyan)" }}>PREV</button>
      <span>PAGE {pageNumber} / {maxPage}</span>
      <button disabled={pageNumber >= maxPage} onClick={() => setPageNumber((p) => p + 1)}
        style={{ color: pageNumber >= maxPage ? "var(--con-faint)" : "var(--accent-cyan)" }}>NEXT</button>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-[26px] pt-[22px]">
        <div className="flex min-w-0 items-center gap-4">
          {logo && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logo} alt="" className="h-[44px] w-[96px] shrink-0 rounded-[6px] object-contain p-1"
              style={{ background: "var(--well)", border: "1px solid var(--con-border)" }} />
          )}
          <div className="min-w-0">
            <h2 className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[22px] font-semibold tracking-[-0.01em]">{title}</h2>
            <div className="con-count mt-1">
              {studio?.parentName ? `${studio.parentName.toUpperCase()} · ` : ""}
              {anyLoading ? "…" : `${totalCount.toLocaleString()} SCENE${totalCount === 1 ? "" : "S"}`}
              {notAdded && <span style={{ color: "var(--con-faint)" }}> · NOT ADDED</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/studios" className="con-btn-ghost">
            <ArrowLeft size={13} strokeWidth={2.4} />
            Studios
          </Link>
          {studio && (
            confirmRemove ? (
              <>
                <button type="button" onClick={handleRemove} disabled={removing} className="con-btn-ghost"
                  style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>
                  {removing ? "Removing…" : "Confirm remove"}
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} className="con-btn-ghost">Cancel</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmRemove(true)} className="con-btn-ghost">
                <Trash2 size={13} strokeWidth={2.2} />
                Remove
              </button>
            )
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-[10px] px-[26px] pt-[18px]">
        <div className="flex overflow-hidden rounded-[6px]" style={{ border: "1px solid var(--con-border)" }}>
          {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              disabled={!organisedTagId && s !== "all"}
              onClick={() => changeFilter(() => setStatus(s))}
              className="px-[11px] py-[7px] text-[12px]"
              style={status === s
                ? { background: "var(--accent-cyan)", color: "var(--accent-ink)", fontWeight: 600 }
                : { background: "var(--well)", color: "var(--con-muted)" }}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => changeFilter(() => setHasMarkers((v) => !v))}
          className="flex items-center gap-[7px] rounded-[6px] px-[11px] py-[7px] text-[12px]"
          style={{
            background: "var(--well)",
            border: "1px solid var(--con-border)",
            color: hasMarkers ? "var(--con-text-2)" : "var(--con-muted)",
          }}
        >
          <span
            className="flex h-[14px] w-[14px] items-center justify-center rounded-[4px]"
            style={hasMarkers
              ? { background: "var(--accent-cyan)", color: "var(--accent-ink)" }
              : { border: "1px solid var(--con-border-faint)" }}
          >
            {hasMarkers && <Check size={9} strokeWidth={4} />}
          </span>
          Has markers
        </button>
        <div className="flex-1" />
        <div className="relative w-[250px]">
          <Search size={14} className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2" style={{ color: "var(--con-faint)" }} />
          <input
            value={searchTerm}
            onChange={(e) => changeFilter(() => setSearchTerm(e.target.value))}
            placeholder="search by title…"
            aria-label="Search scenes"
            className="con-input w-full pl-[33px] pr-[30px]"
          />
          {searchTerm && (
            <button onClick={() => changeFilter(() => setSearchTerm(""))} aria-label="Clear search"
              className="absolute right-[10px] top-1/2 -translate-y-1/2" style={{ color: "var(--con-muted)" }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="px-[26px] pb-[26px] pt-[18px]">
        {pager && <div className="mb-4">{pager}</div>}

        {anyLoading && scenes.length === 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="aspect-video animate-pulse rounded-[6px]" style={{ background: "var(--well)", border: "1px solid var(--con-border)" }} />
            ))}
          </div>
        )}

        {!anyLoading && error && (
          <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error.message}</p>
        )}

        {!anyLoading && !error && scenes.length === 0 && (
          <div className="rounded-[7px] p-6 text-center" style={{ background: "var(--surface)", border: "1px dashed var(--con-border-strong)" }}>
            <div className="text-[14px] font-semibold">No scenes found</div>
            <div className="mt-1 text-[13px]" style={{ color: "var(--con-muted)" }}>
              Try a different status or turn off &quot;Has markers&quot;.
            </div>
          </div>
        )}

        {scenes.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                studioId={studioId}
                organised={!!organisedTagId && (scene.tags ?? []).some((t) => String(t.id) === organisedTagId)}
                shot={makeStashUrl(scene.paths?.screenshot, stashServer, stashAPI) || ""}
              />
            ))}
          </div>
        )}

        {pager && <div className="mt-5">{pager}</div>}
      </div>
    </div>
  );
}

export default function StudioScenesPage() {
  return (
    <Suspense fallback={<div className="px-[26px] pt-[22px] text-[13px]" style={{ color: "var(--con-muted)" }}>Loading…</div>}>
      <StudioScenesContent />
    </Suspense>
  );
}
