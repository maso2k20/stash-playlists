"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  List,
  Users,
  Clapperboard,
  Sliders,
  Play,
  PanelLeft,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
};

const LIBRARY: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/playlists", label: "Playlists", icon: List },
  { href: "/actors", label: "Actors", icon: Users },
  { href: "/scenes", label: "Scenes", icon: Clapperboard },
];

const SYSTEM: NavItem[] = [{ href: "/settings", label: "Settings", icon: Sliders }];

const STORAGE_KEY = "sidebarCollapsed";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className="relative flex items-center rounded-[7px] text-[13px] no-underline transition-colors mb-0.5"
      style={{
        justifyContent: collapsed ? "center" : "flex-start",
        gap: collapsed ? 0 : 11,
        padding: collapsed ? "10px 0" : "9px 10px",
        color: active ? "var(--con-text)" : "var(--con-muted)",
        background: active ? "var(--surface)" : "transparent",
        fontWeight: active ? 600 : 400,
      }}
    >
      {active && (
        <span
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-[2px]"
          style={{ background: "var(--accent-cyan)" }}
        />
      )}
      <Icon size={16} strokeWidth={2} color={active ? "var(--accent-cyan)" : "currentColor"} />
      {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
    </Link>
  );
}

export default function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const [collapsed, setCollapsed] = useState(false);

  // Read persisted state on mount (client-only to avoid SSR mismatch).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div
      className="flex h-screen overflow-hidden font-sans"
      style={{ background: "var(--app-bg)", color: "var(--con-text)" }}
    >
      {/* Sidebar */}
      <aside
        className="flex h-full shrink-0 flex-col"
        style={{
          width: collapsed ? 64 : 212,
          transition: "width 160ms ease",
          background: "var(--rail-bg)",
          borderRight: "1px solid var(--divider)",
          padding: collapsed ? "18px 10px" : "18px 14px",
        }}
      >
        {/* Brand */}
        <div
          className="flex items-center pb-[22px]"
          style={{ justifyContent: collapsed ? "center" : "flex-start", gap: 9, padding: "6px 8px 22px" }}
        >
          <span
            className="flex shrink-0 items-center justify-center rounded-[6px]"
            style={{ width: 24, height: 24, background: "var(--accent-cyan)", color: "var(--accent-ink)" }}
          >
            <Play size={14} fill="currentColor" stroke="none" />
          </span>
          {!collapsed && (
            <span className="whitespace-nowrap text-[13px] font-semibold tracking-[0.01em]">
              Stash Playlists
            </span>
          )}
        </div>

        {!collapsed && <div className="con-micro px-2 pb-[9px]">Library</div>}
        {LIBRARY.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
        ))}

        <div className="flex-1" />

        {!collapsed && <div className="con-micro px-2 pb-[9px]">System</div>}
        {SYSTEM.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
        ))}

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="relative mt-1 flex items-center rounded-[7px] text-[13px] transition-colors"
          style={{
            justifyContent: collapsed ? "center" : "flex-start",
            gap: collapsed ? 0 : 11,
            padding: collapsed ? "10px 0" : "9px 10px",
            color: "var(--con-muted)",
            background: "transparent",
          }}
        >
          <PanelLeft size={16} strokeWidth={2} />
          {!collapsed && <span className="whitespace-nowrap">Collapse</span>}
        </button>
      </aside>

      {/* Main column. Block (not flex) so deferred MUI pages that center with
          `mx:auto` keep their original block layout; migrated pages set their
          own flex root. */}
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
