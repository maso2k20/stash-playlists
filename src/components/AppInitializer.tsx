// src/components/AppInitializer.tsx

"use client";

import { useEffect } from "react";

export function AppInitializer() {
  useEffect(() => {
    // Initialize the application on mount
    const initialize = async () => {
      try {
        const response = await fetch("/api/init");
        if (!response.ok) {
          console.error("Failed to initialize application");
        }
      } catch (error) {
        console.error("Failed to initialize application:", error);
      }
    };

    initialize();
  }, []);

  // This component doesn't render anything
  return null;
}