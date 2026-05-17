// src/lib/playlistsCache.ts
//
// Tiny wrapper around SWR's global mutate so any mutation site can
// invalidate the consolidated playlists list cache with a single call.
//
// Usage:
//   import { invalidatePlaylists, PLAYLISTS_LIST_KEY } from "@/lib/playlistsCache";
//   // after a successful create/delete/refresh/edit:
//   await invalidatePlaylists();

import { mutate } from "swr";

export const PLAYLISTS_LIST_KEY = "/api/playlists";

export const playlistsFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
};

// Force any active /api/playlists subscribers to revalidate. Call this
// after any mutation that changes a playlist, its items, or its conditions.
export function invalidatePlaylists() {
  return mutate(PLAYLISTS_LIST_KEY);
}
