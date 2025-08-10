"use client";

import * as React from "react";
import Button from "@mui/joy/Button";
import Tooltip from "@mui/joy/Tooltip";
import { RefreshCcw } from "lucide-react";

type Props = {
  playlistId: string;
  disabled?: boolean;
  onRefreshed?: () => void; // called after successful refresh so caller can re-fetch
};

export function RefreshSmartButton({ playlistId, disabled, onRefreshed }: Props) {
  const [busy, setBusy] = React.useState(false);

  const handleClick = async () => {
    if (!playlistId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onRefreshed?.();
    } catch (e) {
      console.error("Refresh failed", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip title="Rebuild this smart playlist now" variant="outlined">
      <span>
        <Button
          size="sm"
          variant="outlined"
          disabled={disabled || busy}
          onClick={handleClick}
          startDecorator={
            <RefreshCcw className={busy ? "animate-spin" : ""} size={16} />
          }
        >
          Refresh
        </Button>
      </span>
    </Tooltip>
  );
}
