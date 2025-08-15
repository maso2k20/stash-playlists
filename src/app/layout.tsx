// app/layout.tsx (Server Component)
import type { ReactNode } from "react";
import Link from "next/link";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v14-appRouter";
import ClientProviders from "@/components/ClientProviders";
import { Sheet, Box, Typography } from "@mui/joy";
import { AppInitializer } from "@/components/AppInitializer";
import HomeIcon from "@mui/icons-material/Home";
import PlaylistPlayIcon from "@mui/icons-material/PlaylistPlay";
import PeopleIcon from "@mui/icons-material/People";
import SettingsIcon from "@mui/icons-material/Settings";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="emotion-insertion-point" content="" />
      </head>
      <body className="antialiased">
        <AppRouterCacheProvider options={{ key: "mui", prepend: true }}>
          <ClientProviders>
            <AppInitializer />
            <NavBar />
            {children}
          </ClientProviders>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}

function NavBar() {
  const navItems = [
    { href: "/", icon: HomeIcon, label: "Home" },
    { href: "/playlists", icon: PlaylistPlayIcon, label: "Playlists" },
    { href: "/actors", icon: PeopleIcon, label: "Actors" },
  ];

  return (
    <Sheet
      component="nav"
      variant="solid"
      color="neutral"
      sx={{
        px: 3,
        py: 2,
        borderBottom: "1px solid",
        borderColor: "neutral.outlinedBorder",
        minHeight: 64,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: 1600,
          mx: "auto",
          height: "100%",
        }}
      >
        {/* Left navigation items */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 4 }}>
          {navItems.map(({ href, icon: Icon, label }) => (
            <Box
              key={href}
              component={Link}
              href={href}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                color: "neutral.solidColor",
                textDecoration: "none",
                px: 2,
                py: 1,
                borderRadius: "sm",
                transition: "all 0.2s ease",
                "&:hover": {
                  backgroundColor: "neutral.softBg",
                  transform: "translateY(-1px)",
                },
              }}
            >
              <Icon sx={{ fontSize: 20 }} />
              <Typography
                level="body-sm"
                sx={{
                  fontWeight: 500,
                  fontSize: "0.875rem",
                }}
              >
                {label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Right-aligned Settings */}
        <Box
          component={Link}
          href="/settings"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            color: "neutral.solidColor",
            textDecoration: "none",
            px: 2,
            py: 1,
            borderRadius: "sm",
            transition: "all 0.2s ease",
            "&:hover": {
              backgroundColor: "neutral.softBg",
              transform: "translateY(-1px)",
            },
          }}
        >
          <SettingsIcon sx={{ fontSize: 20 }} />
          <Typography
            level="body-sm"
            sx={{
              fontWeight: 500,
              fontSize: "0.875rem",
            }}
          >
            Settings
          </Typography>
        </Box>
      </Box>
    </Sheet>
  );
}
