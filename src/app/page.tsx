// src/app/page.tsx
"use client";

import Link from "next/link";
import {
  List,
  Inbox,
  Users,
  Clapperboard,
  Sliders,
  ArrowRight,
} from "lucide-react";

// Lightweight landing dashboard. Deliberately does no data fetching so the
// home page loads instantly — the heavy "Unorganised Scenes" view now lives
// at /unorganised. Richer dashboard widgets can be added here over time.
const QUICK_LINKS = [
  { href: "/playlists", label: "Playlists", desc: "Browse and play your playlists", icon: List },
  { href: "/unorganised", label: "Unorganised", desc: "Scenes with markers that still need organising", icon: Inbox },
  { href: "/actors", label: "Actors", desc: "Browse performers and their scenes", icon: Users },
  { href: "/scenes", label: "Scenes", desc: "Browse all scenes and edit markers", icon: Clapperboard },
  { href: "/settings", label: "Settings", desc: "Stash connection, backups, automation", icon: Sliders },
];

export default function Dashboard() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="px-[26px] pt-[22px]">
        <h2 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Dashboard</h2>
        <div className="con-count mt-1">QUICK ACCESS</div>
      </div>

      <div className="grid grid-cols-1 gap-[11px] px-[26px] pb-[26px] pt-[18px] sm:grid-cols-2 xl:grid-cols-3">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="con-card group flex items-center gap-[13px] p-4 no-underline"
              style={{ color: "var(--con-text)" }}
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px]"
                style={{ background: "var(--well)", border: "1px solid var(--con-border)", color: "var(--accent-cyan)" }}
              >
                <Icon size={20} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{link.label}</div>
                <div className="mt-0.5 text-[12px]" style={{ color: "var(--con-muted)" }}>
                  {link.desc}
                </div>
              </div>
              <ArrowRight
                size={16}
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: "var(--con-muted)" }}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
