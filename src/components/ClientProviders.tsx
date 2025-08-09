// components/ClientProviders.tsx
"use client";

import { ReactNode } from "react";
import ThemeProvider from "@/components/ThemeProvider";      
import { ApolloProvider } from "@/components/ApolloProvider";  
import { SettingsProvider } from "@/app/context/SettingsContext";
import { StashTagsProvider } from "@/context/StashTagsContext";

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ApolloProvider>
        <SettingsProvider>
          <StashTagsProvider>
            {children}
          </StashTagsProvider>
        </SettingsProvider>
      </ApolloProvider>
    </ThemeProvider>
  );
}
