// src/app/page.tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery, gql } from "@apollo/client";
import { useStashTags } from "@/context/StashTagsContext";

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
  valueColor,
}: {
  label: string;
  value: number | null | undefined;
  loading: boolean;
  href?: string;
  valueColor?: string;
}) {
  const display =
    loading ? "…" : value == null ? "—" : value.toLocaleString();

  const inner = (
    <>
      <div className="text-[13px] font-medium" style={{ color: "var(--con-muted)" }}>
        {label}
      </div>
      <div
        className="mt-2 text-[34px] font-semibold leading-none tracking-[-0.01em] tabular-nums"
        style={{ color: valueColor ?? "var(--con-text)" }}
      >
        {display}
      </div>
    </>
  );

  const className = "stat-card group flex flex-col justify-center p-[18px] no-underline";
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
          valueColor="var(--rating)"
        />
      </div>
    </div>
  );
}
