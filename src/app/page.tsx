// src/app/page.tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery, gql } from "@apollo/client";
import { useStashTags } from "@/context/StashTagsContext";
import { Inbox, ArrowRight } from "lucide-react";

// Count-only query: scenes with markers but without the "Markers Organised"
// tag. Selecting just `count` keeps the dashboard cheap to load.
const GET_UNORGANISED_COUNT = gql`
  query getUnorganisedCount($markersOrganisedIds: [ID!]!) {
    findScenes(
      scene_filter: {
        has_markers: "true"
        tags: { modifier: EXCLUDES, value: $markersOrganisedIds }
      }
      filter: { per_page: 0 }
    ) {
      count
    }
  }
`;

function StatCard({
  label,
  value,
  loading,
  href,
  icon: Icon,
}: {
  label: string;
  value: number | null | undefined;
  loading: boolean;
  href?: string;
  icon: typeof Inbox;
}) {
  const display =
    loading ? "…" : value == null ? "—" : value.toLocaleString();

  const inner = (
    <>
      {/* Top row: icon (left) + big count (right) */}
      <div className="flex items-center justify-between">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-[9px]"
          style={{ background: "var(--well)", border: "1px solid var(--con-border-strong)", color: "var(--accent-cyan)" }}
        >
          <Icon size={20} strokeWidth={2} />
        </span>
        <span className="text-[38px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
          {display}
        </span>
      </div>

      {/* Bottom row: title (left) + hover arrow (right) */}
      <div className="flex items-end justify-between">
        <span className="text-[13px] font-medium" style={{ color: "var(--con-text-2)" }}>
          {label}
        </span>
        {href && (
          <ArrowRight
            size={16}
            className="opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: "var(--con-muted)" }}
          />
        )}
      </div>
    </>
  );

  const className = "stat-card group flex flex-col justify-between p-[18px] no-underline";
  return href ? (
    <Link href={href} className={className} style={{ color: "var(--con-text)" }}>
      {inner}
    </Link>
  ) : (
    <div className={className} style={{ color: "var(--con-text)" }}>
      {inner}
    </div>
  );
}

export default function Dashboard() {
  const { stashTags, loading: tagsLoading } = useStashTags();

  const markersOrganisedTagId = useMemo(() => {
    const tag = stashTags?.find((t: { id: string; name: string }) => t.name === "Markers Organised");
    return tag?.id ? String(tag.id) : null;
  }, [stashTags]);

  const { data, loading: countLoading } = useQuery(GET_UNORGANISED_COUNT, {
    variables: { markersOrganisedIds: markersOrganisedTagId ? [markersOrganisedTagId] : [] },
    skip: !markersOrganisedTagId,
    fetchPolicy: "cache-and-network",
  });

  const unorganisedCount: number | null | undefined = data?.findScenes?.count;
  const unorganisedLoading = tagsLoading || (!!markersOrganisedTagId && countLoading);

  return (
    <div className="flex min-h-full flex-col">
      <div className="px-[26px] pt-[22px]">
        <h2 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Dashboard</h2>
        <div className="con-count mt-1">OVERVIEW</div>
      </div>

      <div className="stat-grid px-[26px] pb-[26px] pt-[18px]">
        <StatCard
          label="Unorganised Scenes"
          value={unorganisedCount}
          loading={unorganisedLoading}
          href="/unorganised"
          icon={Inbox}
        />
      </div>
    </div>
  );
}
