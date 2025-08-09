// app/layout.tsx (Server Component)
import type { ReactNode } from "react";
import Link from "next/link";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v14-appRouter";

// If your ClientProviders already wraps Joy's CssVarsProvider + Apollo, keep it.
import ClientProviders from "@/components/ClientProviders";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Ensures client & server inject styles in the same place */}
        <meta name="emotion-insertion-point" content="" />
      </head>
      <body className="antialiased">
        {/* Make sure Joy/MUI providers wrap the NAV too, so it’s styled */}
        <AppRouterCacheProvider options={{ key: "mui", prepend: true }}>
          <ClientProviders>
            {/* Top bar */}
            <NavBar />

            {/* Page content */}
            {children}
          </ClientProviders>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}

/** JoyUI NavBar (Server Component) */
import { Sheet, Button, Box } from "@mui/joy";

function NavBar() {
  return (
    <Sheet
      component="nav"
      variant="solid"
      color="neutral"
      sx={{
        px: 2,
        py: 1,
        display: "flex",
        gap: 1,
        alignItems: "center",
        borderBottom: "1px solid",
        borderColor: "neutral.outlinedBorder",
      }}
    >
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
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
    </Sheet>
  );
}
