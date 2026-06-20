// app/layout.tsx (Server Component)
import "./globals.css";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v14-appRouter";
import ClientProviders from "@/components/ClientProviders";
import { AppInitializer } from "@/components/AppInitializer";
import ConsoleShell from "@/components/ConsoleShell";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <meta name="emotion-insertion-point" content="" />
      </head>
      <body className="antialiased">
        <AppRouterCacheProvider options={{ key: "mui", prepend: true }}>
          <ClientProviders>
            <AppInitializer />
            <ConsoleShell>{children}</ConsoleShell>
          </ClientProviders>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
