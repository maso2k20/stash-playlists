// filepath: src/app/settings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  Box,
  Typography,
  Table,
  Input,
  Button,
  Chip,
  Snackbar,
  Skeleton,
  IconButton,
  Tooltip,
  Select,
  Option,
} from "@mui/joy";
import { useColorScheme } from "@mui/joy/styles";
import { Check, RotateCcw, Save, RefreshCw } from "lucide-react";

type Setting = {
  id: string;
  key: string;
  value: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

const THEME_KEY = "THEME_MODE";
const THEME_OPTIONS = ["light", "dark", "system"] as const;
type ThemeMode = (typeof THEME_OPTIONS)[number];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[] | null>(null);
  const [original, setOriginal] = useState<Setting[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; color?: "success" | "danger" | "neutral" }>({
    open: false,
    msg: "",
  });

  const { setMode } = useColorScheme();

  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Setting[] = await res.json();
      const sorted = [...data].sort((a, b) => a.key.localeCompare(b.key));
      setSettings(sorted);
      setOriginal(sorted);

      // Apply THEME_MODE on load (instant)
      const themeRow = sorted.find((s) => s.key === THEME_KEY);
      if (themeRow && THEME_OPTIONS.includes(themeRow.value as ThemeMode)) {
        setMode(themeRow.value as ThemeMode);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const changed = useMemo(() => {
    if (!settings || !original) return [];
    const map = new Map(original.map((s) => [s.key, s.value ?? ""]));
    return settings.filter((s) => (s.value ?? "") !== (map.get(s.key) ?? ""));
  }, [settings, original]);

  const hasChanges = changed.length > 0;

  const updateOne = (key: string, value: string) => {
    setSettings((prev) => (prev ? prev.map((s) => (s.key === key ? { ...s, value } : s)) : prev));
  };

  const resetAll = () => {
    if (original) {
      setSettings(original);
      // Re-apply theme from original (instant)
      const themeRow = original.find((s) => s.key === THEME_KEY);
      if (themeRow && THEME_OPTIONS.includes(themeRow.value as ThemeMode)) {
        setMode(themeRow.value as ThemeMode);
      }
    }
  };

  const resetOne = (key: string) => {
    if (!original || !settings) return;
    const orig = original.find((o) => o.key === key);
    if (!orig) return;
    setSettings(settings.map((s) => (s.key === key ? { ...s, value: orig.value ?? "" } : s)));
    if (key === THEME_KEY && THEME_OPTIONS.includes(orig.value as ThemeMode)) {
      setMode(orig.value as ThemeMode);
    }
  };

  const save = async () => {
    if (!hasChanges || !settings) return;
    setSaving(true);
    setError(null);
    try {
      const updates = changed.map(({ key, value }) => ({ key, value }));
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);

      // Refresh to sync updatedAt, also re-apply theme from server source of truth
      await load();
      setSnack({ open: true, msg: "Settings saved", color: "success" });
    } catch (e: any) {
      setError(e.message ?? "Failed to save");
      setSnack({ open: true, msg: "Failed to save settings", color: "danger" });
    } finally {
      setSaving(false);
    }
  };

  // Renders the appropriate editor for a row
  const renderEditor = (s: Setting) => {
    if (s.key === THEME_KEY) {
      const current = THEME_OPTIONS.includes(s.value as ThemeMode)
        ? (s.value as ThemeMode)
        : ("system" as ThemeMode);

      return (
        <Select
          value={current}
          onChange={(_e, val) => {
            const next = (val ?? "system") as ThemeMode;
            updateOne(THEME_KEY, next);
            setMode(next); // instant apply
          }}
          size="sm"
          sx={{ minWidth: 200 }}
        >
          <Option value="light">Light</Option>
          <Option value="dark">Dark</Option>
          <Option value="system">System (match OS)</Option>
        </Select>
      );
    }

    // default text input for other keys
    return (
      <Input
        value={s.value ?? ""}
        onChange={(e) => updateOne(s.key, e.target.value)}
        placeholder="Enter value…"
        size="sm"
        sx={{ width: "100%" }}
      />
    );
  };

  return (
    <Sheet sx={{ p: 2, maxWidth: 900, mx: "auto" }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, flexWrap: "wrap" }}>
        <Typography level="h2" sx={{ flexGrow: 1 }}>
          Settings
        </Typography>

        <Tooltip title="Reload from server">
          <IconButton variant="plain" onClick={load} disabled={loading || saving}>
            <RefreshCw size={18} />
          </IconButton>
        </Tooltip>

        <Button
          startDecorator={<RotateCcw size={16} />}
          variant="plain"
          size="sm"
          onClick={resetAll}
          disabled={!hasChanges || saving || loading}
        >
          Reset changes
        </Button>

        <Button
          startDecorator={<Save size={16} />}
          size="sm"
          onClick={save}
          disabled={!hasChanges || saving || loading}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </Box>

      {/* Error */}
      {error && (
        <Typography color="danger" level="body-sm" sx={{ mb: 1 }}>
          {error}
        </Typography>
      )}

      {/* Table */}
      {loading ? (
        <Box>
          {Array.from({ length: 6 }).map((_, i) => (
            <Box
              key={i}
              sx={{
                display: "grid",
                gridTemplateColumns: "220px 1fr 170px",
                gap: 1,
                alignItems: "center",
                py: 1,
              }}
            >
              <Skeleton variant="text" level="body-sm" />
              <Skeleton />
              <Skeleton variant="text" level="body-sm" />
            </Box>
          ))}
        </Box>
      ) : (
        <Table
          borderAxis="xBetween"
          size="sm"
          sx={{
            "--TableCell-paddingY": "10px",
            "--TableCell-paddingX": "10px",
            borderRadius: "lg",
            boxShadow: "sm",
          }}
        >
          <thead>
            <tr>
              <th style={{ width: 240 }}>Key</th>
              <th>Value</th>
              <th style={{ width: 170 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {(settings ?? []).map((s) => {
              const origVal = original?.find((o) => o.key === s.key)?.value ?? "";
              const dirty = (s.value ?? "") !== (origVal ?? "");
              return (
                <tr key={s.id}>
                  <td>
                    <Typography level="title-sm">{s.key}</Typography>
                    <Typography level="body-xs" sx={{ color: "neutral.500" }}>
                      Updated: {fmt(s.updatedAt)}
                    </Typography>
                    {s.key === THEME_KEY && (
                      <Typography level="body-xs" sx={{ color: "neutral.500", mt: 0.5 }}>
                        Controls the site theme. Choose Light, Dark, or System to match your OS.
                      </Typography>
                    )}
                  </td>
                  <td>{renderEditor(s)}</td>
                  <td>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      {dirty ? (
                        <Chip size="sm" color="warning" variant="soft">
                          Modified
                        </Chip>
                      ) : (
                        <Chip size="sm" color="success" variant="soft" startDecorator={<Check size={14} />}>
                          Saved
                        </Chip>
                      )}
                      {dirty && (
                        <Tooltip title="Revert this row">
                          <IconButton size="sm" variant="plain" onClick={() => resetOne(s.key)}>
                            <RotateCcw size={16} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Snackbar
        open={snack.open}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        color={snack.color ?? "neutral"}
        variant="soft"
        autoHideDuration={3000}
      >
        {snack.msg}
      </Snackbar>
    </Sheet>
  );
}
