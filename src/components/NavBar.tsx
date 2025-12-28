"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sheet, Box, Typography } from "@mui/joy";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/playlists", label: "Playlists" },
  { href: "/actors", label: "Actors" },
  { href: "/scenes", label: "Scenes" },
  { href: "/settings", label: "Settings" },
];

export default function NavBar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  return (
    <Sheet
      component="nav"
      sx={{
        px: 3,
        py: 1,
        borderBottom: "1px solid",
        borderColor: "neutral.outlinedBorder",
        bgcolor: "background.surface",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          maxWidth: 1600,
          mx: "auto",
        }}
      >
        {/* App Title */}
        <Typography
          level="title-md"
          sx={{
            fontWeight: 700,
            mr: 3,
            color: "text.primary",
          }}
        >
          Stash Playlists
        </Typography>

        {/* Navigation Items */}
        {navItems.map(({ href, label }) => {
          const active = isActive(href);
          return (
            <Box
              key={href}
              component={Link}
              href={href}
              sx={{
                color: active ? "text.primary" : "text.secondary",
                textDecoration: "none",
                px: 1.5,
                py: 0.75,
                borderRadius: "sm",
                fontSize: "0.875rem",
                fontWeight: active ? 500 : 400,
                bgcolor: active ? "neutral.softBg" : "transparent",
                transition: "all 0.15s ease",
                "&:hover": {
                  bgcolor: active ? "neutral.softBg" : "neutral.plainHoverBg",
                  color: "text.primary",
                },
              }}
            >
              {label}
            </Box>
          );
        })}
      </Box>
    </Sheet>
  );
}
