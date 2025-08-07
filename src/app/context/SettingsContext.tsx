"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";

// Type for settings object
type SettingsType = { [key: string]: string };

// Create context with type
const SettingsContext = createContext<SettingsType>({});

// Provider with typed children
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsType>({});

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        const obj: SettingsType = {};
        data.forEach((s: { key: string; value: string }) => { obj[s.key] = s.value; });
        setSettings(obj);
      });
  }, []);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}

// Typed hook
export function useSettings(): SettingsType {
  return useContext(SettingsContext);
}