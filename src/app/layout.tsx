// app/layout.tsx (Server Component)
import type { ReactNode } from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v14-appRouter";
import ClientProviders from "@/components/ClientProviders";
import { AppInitializer } from "@/components/AppInitializer";
import NavBar from "@/components/NavBar";

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
