// app/layout.tsx (Server Component)
import type { ReactNode } from "react";
import Link from "next/link";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v14-appRouter";
import ClientProviders from "@/components/ClientProviders";
import { Sheet, Button, Box } from "@mui/joy";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="emotion-insertion-point" content="" />
      </head>
      <body className="antialiased">
        <AppRouterCacheProvider options={{ key: "mui", prepend: true }}>
          <ClientProviders>
            <NavBar />
            {children}
          </ClientProviders>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}

function NavBar() {
  return (
    <Sheet
      component="nav"
      variant="solid"
      color="neutral"
      sx={{
        px: 2,
        py: 1,
        borderBottom: "1px solid",
        borderColor: "neutral.outlinedBorder",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          maxWidth: 1600,
          mx: "auto",
        }}
      >
        {/* Left links */}
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Button component={Link} href="/" variant="soft" size="sm">
            Home
          </Button>
          <Button component={Link} href="/playlists" variant="soft" size="sm">
            Playlists
          </Button>
          <Button component={Link} href="/actors" variant="soft" size="sm">
            Actors
          </Button>
        </Box>

        {/* Spacer pushes Settings to the right */}
        <Box sx={{ flexGrow: 1 }} />

        {/* Right-aligned Settings */}
        <Button component={Link} href="/settings" variant="soft" size="sm" color="neutral">
          Settings
        </Button>
      </Box>
    </Sheet>
  );
}
