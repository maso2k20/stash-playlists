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
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  FormControl,
  FormLabel,
  FormHelperText,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from "@mui/joy";
import { useColorScheme } from "@mui/joy/styles";
import { Check, RotateCcw, Save, RefreshCw, RefreshCcw, ChevronDown, AlertCircle, Wifi, WifiOff, Database, Download, Trash2, Upload, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";
import PerformerCountTagSettings from "@/components/PerformerCountTagSettings";
import TemplateManager from "@/components/TemplateManager";
import { 
  getSettingsByCategory, 
  getSettingDefinition, 
  type SettingDefinition 
} from "@/lib/settingsDefinitions";

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
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success?: boolean;
    message?: string;
    details?: string;
    version?: string;
  } | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{
    enabled: boolean;
    lastBackup?: string;
    nextBackup?: string;
    retentionDays: number;
    backupHour: number;
  } | null>(null);
  const [backups, setBackups] = useState<{
    filename: string;
    size: number;
    created: string;
    sizeFormatted: string;
  }[]>([]);
  const [refreshStatus, setRefreshStatus] = useState<{
    enabled: boolean;
    lastRefresh?: string;
    nextRefresh?: string;
    interval: string;
    refreshHour: number;
    refreshDay?: number;
    isRunning: boolean;
  } | null>(null);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [refreshHistory, setRefreshHistory] = useState<{
    id: string;
    refreshType: string;
    success: boolean;
    refreshedPlaylists: number;
    errors: string[] | null;
    duration: number;
    createdAt: string;
  }[]>([]);
  const [maintenanceHistory, setMaintenanceHistory] = useState<{
    id: string;
    refreshType: string;
    success: boolean;
    refreshedPlaylists: number;
    errors: string[] | null;
    duration: number;
    createdAt: string;
  }[]>([]);
  const [maintenanceStatus, setMaintenanceStatus] = useState<{
    enabled: boolean;
    hour: number;
    isRunning: boolean;
    nextRun?: string;
    cronActive: boolean;
  } | null>(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [backfillStatus, setBackfillStatus] = useState<{
    totalItems: number;
    itemsWithSceneId: number;
    itemsNeedingBackfill: number;
    backfillPercentage: number;
  } | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [showApiKey, setShowApiKey] = useState(false);
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load settings";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadBackupInfo();
    loadRefreshInfo();
    loadMaintenanceInfo();
    loadBackfillStatus();
  }, []);

  const loadBackupInfo = async () => {
    try {
      const res = await fetch("/api/backup", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setBackupStatus(data.status);
        setBackups(data.backups);
      }
    } catch (error) {
      console.error('Failed to load backup info:', error);
    }
  };

  const loadRefreshInfo = async () => {
    try {
      // Load refresh status
      const res = await fetch("/api/smart-playlists/refresh-all", { 
        method: "GET",
        cache: "no-store" 
      });
      if (res.ok) {
        const data = await res.json();
        setRefreshStatus(data.data);
      }

      // Load refresh history
      const historyRes = await fetch("/api/smart-playlists/refresh-all?action=history", { 
        method: "GET",
        cache: "no-store" 
      });
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setRefreshHistory(historyData.data);
      }
    } catch (error) {
      console.error('Failed to load refresh info:', error);
    }
  };

  const loadMaintenanceInfo = async () => {
    try {
      // Load maintenance status
      const res = await fetch("/api/maintenance", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMaintenanceStatus(data.data);
      }

      // Load maintenance history
      const historyRes = await fetch("/api/maintenance?action=history", { 
        method: "GET",
        cache: "no-store" 
      });
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setMaintenanceHistory(historyData.data);
      }
    } catch (error) {
      console.error('Failed to load maintenance info:', error);
    }
  };

  const loadBackfillStatus = async () => {
    try {
      const res = await fetch("/api/maintenance/backfill-scene-ids", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setBackfillStatus(data.data);
      }
    } catch (error) {
      console.error('Failed to load backfill status:', error);
    }
  };

  const changed = useMemo(() => {
    if (!settings || !original) return [];
    const map = new Map(original.map((s) => [s.key, s.value ?? ""]));
    return settings.filter((s) => (s.value ?? "") !== (map.get(s.key) ?? ""));
  }, [settings, original]);

  const hasChanges = changed.length > 0;

  const updateOne = (key: string, value: string) => {
    setSettings((prev) => (prev ? prev.map((s) => (s.key === key ? { ...s, value } : s)) : prev));
    
    // Validate the new value
    const definition = getSettingDefinition(key);
    if (definition?.validation) {
      const error = definition.validation(value);
      setValidationErrors(prev => ({
        ...prev,
        [key]: error || ''
      }));
    }
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
    
    // Clear validation error
    setValidationErrors(prev => ({ ...prev, [key]: '' }));
    
    if (key === THEME_KEY && THEME_OPTIONS.includes(orig.value as ThemeMode)) {
      setMode(orig.value as ThemeMode);
    }
  };
  
  const resetToDefault = (key: string) => {
    const definition = getSettingDefinition(key);
    if (!definition) return;
    
    updateOne(key, definition.defaultValue);
    if (key === THEME_KEY && THEME_OPTIONS.includes(definition.defaultValue as ThemeMode)) {
      setMode(definition.defaultValue as ThemeMode);
    }
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    
    try {
      const response = await fetch('/api/settings/test-connection', {
        method: 'POST',
      });
      
      const result = await response.json();
      setConnectionResult(result);
      
      if (result.success) {
        setSnack({ 
          open: true, 
          msg: `Connected to Stash ${result.version}`, 
          color: "success" 
        });
      } else {
        setSnack({ 
          open: true, 
          msg: `Connection failed: ${result.error}`, 
          color: "danger" 
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setConnectionResult({
        success: false,
        message: 'Failed to test connection',
        details: errorMsg,
      });
      setSnack({ 
        open: true, 
        msg: 'Failed to test connection', 
        color: "danger" 
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const save = async () => {
    if (!hasChanges || !settings) return;
    
    // Check for validation errors
    const hasValidationErrors = Object.values(validationErrors).some(error => error);
    if (hasValidationErrors) {
      setSnack({ open: true, msg: "Please fix validation errors before saving", color: "danger" });
      return;
    }
    
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

      // Clear validation errors on successful save
      setValidationErrors({});
      
      // Update backup schedule if backup settings changed
      const backupSettingsChanged = changed.some(c => 
        ['BACKUP_ENABLED', 'BACKUP_RETENTION_DAYS', 'BACKUP_HOUR'].includes(c.key)
      );
      
      if (backupSettingsChanged) {
        try {
          await fetch('/api/backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update-schedule' }),
          });
        } catch (error) {
          console.error('Failed to update backup schedule:', error);
        }
      }

      // Update refresh scheduler if refresh settings changed
      const refreshSettingsChanged = changed.some(c => 
        ['SMART_PLAYLIST_REFRESH_ENABLED', 'SMART_PLAYLIST_REFRESH_INTERVAL', 'SMART_PLAYLIST_REFRESH_HOUR', 'SMART_PLAYLIST_REFRESH_DAY'].includes(c.key)
      );
      
      if (refreshSettingsChanged) {
        try {
          await fetch('/api/smart-playlists/refresh-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'restart-scheduler' }),
          });
        } catch (error) {
          console.error('Failed to update refresh scheduler:', error);
        }
      }

      // Update maintenance scheduler if maintenance settings changed
      const maintenanceSettingsChanged = changed.some(c => 
        ['MAINTENANCE_ENABLED', 'MAINTENANCE_HOUR', 'MAINTENANCE_ACTION'].includes(c.key)
      );
      
      if (maintenanceSettingsChanged) {
        try {
          await fetch('/api/maintenance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'restart-scheduler' }),
          });
        } catch (error) {
          console.error('Failed to update maintenance scheduler:', error);
        }
      }
      
      // Refresh to sync updatedAt, also re-apply theme from server source of truth
      await load();
      await loadBackupInfo();
      await loadRefreshInfo();
      await loadMaintenanceInfo();
      await loadBackfillStatus();
      setSnack({ open: true, msg: "Settings saved", color: "success" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save";
      setError(message);
      setSnack({ open: true, msg: "Failed to save settings", color: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const handleBackupAction = async (action: string, filename?: string) => {
    console.log(`🔧 UI: Starting backup action: ${action}`, filename ? `with filename: ${filename}` : '');
    setBackupLoading(true);
    try {
      console.log('🔧 UI: Sending backup request to API...');
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, filename }),
      });
      
      console.log(`🔧 UI: API response status: ${res.status}`);
      const result = await res.json();
      console.log('🔧 UI: API response data:', result);
      
      if (result.success) {
        console.log('✅ UI: Backup action succeeded');
        setSnack({ 
          open: true, 
          msg: result.message, 
          color: 'success' 
        });
        await loadBackupInfo();
      } else {
        console.error('❌ UI: Backup action failed:', result.error);
        setSnack({ 
          open: true, 
          msg: result.error || 'Operation failed', 
          color: 'danger' 
        });
      }
    } catch (error) {
      console.error('❌ UI: Backup action error:', error);
      setSnack({ 
        open: true, 
        msg: `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        color: 'danger' 
      });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRefreshAction = async () => {
    setRefreshLoading(true);
    try {
      const res = await fetch('/api/smart-playlists/refresh-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const result = await res.json();
      
      if (result.success) {
        setSnack({ 
          open: true, 
          msg: result.message, 
          color: 'success' 
        });
      } else {
        setSnack({ 
          open: true, 
          msg: result.message || 'Refresh failed', 
          color: result.data?.refreshedPlaylists > 0 ? 'neutral' : 'danger'
        });
      }
      await loadRefreshInfo();
    } catch (error) {
      setSnack({ 
        open: true, 
        msg: 'Refresh failed', 
        color: 'danger' 
      });
    } finally {
      setRefreshLoading(false);
    }
  };

  const handleMaintenanceAction = async () => {
    setMaintenanceLoading(true);
    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run-check' }),
      });
      
      const result = await res.json();
      
      if (result.success) {
        setSnack({ 
          open: true, 
          msg: result.message, 
          color: 'success' 
        });
      } else {
        setSnack({ 
          open: true, 
          msg: result.message || 'Maintenance failed', 
          color: 'danger'
        });
      }
      await loadMaintenanceInfo();
    } catch (error) {
      setSnack({ 
        open: true, 
        msg: 'Maintenance check failed', 
        color: 'danger' 
      });
    } finally {
      setMaintenanceLoading(false);
    }
  };

  const handleBackfillAction = async () => {
    setBackfillLoading(true);
    try {
      const res = await fetch('/api/maintenance/backfill-scene-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const result = await res.json();
      
      if (result.success) {
        setSnack({ 
          open: true, 
          msg: result.message, 
          color: 'success' 
        });
      } else {
        setSnack({ 
          open: true, 
          msg: result.error || 'Backfill failed', 
          color: 'danger'
        });
      }
      await loadBackfillStatus();
    } catch (error) {
      setSnack({ 
        open: true, 
        msg: 'Scene ID backfill failed', 
        color: 'danger' 
      });
    } finally {
      setBackfillLoading(false);
    }
  };

  // Renders the appropriate editor for a setting
  const renderEditor = (s: Setting, definition: SettingDefinition) => {
    const hasError = !!validationErrors[s.key];
    
    if (definition.type === 'select' && definition.options) {
      return (
        <Select
          value={s.value || definition.defaultValue}
          onChange={(_e, val) => {
            const next = val ?? definition.defaultValue;
            updateOne(s.key, next);
            if (s.key === THEME_KEY && THEME_OPTIONS.includes(next as ThemeMode)) {
              setMode(next as ThemeMode); // instant apply
            }
          }}
          size="sm"
          sx={{ minWidth: 200 }}
          color={hasError ? 'danger' : undefined}
        >
          {definition.options.map(option => (
            <Option key={option} value={option}>
              {option === 'system' ? 'System (match OS)' : 
               option.charAt(0).toUpperCase() + option.slice(1)}
            </Option>
          ))}
        </Select>
      );
    }

    // Special handling for performer count tag recommendations
    if (definition.type === 'json' && definition.key === 'PERFORMER_COUNT_TAG_RECOMMENDATIONS') {
      return (
        <PerformerCountTagSettings
          value={s.value ?? definition.defaultValue}
          onChange={(value) => updateOne(s.key, value)}
          error={hasError}
        />
      );
    }

    // Special handling for API key - obscure when saved
    if (s.key === 'STASH_API') {
      const origVal = original?.find((o) => o.key === s.key)?.value ?? "";
      const hasSavedValue = !!origVal;
      const isDirty = (s.value ?? "") !== origVal;

      return (
        <Input
          type={showApiKey || isDirty ? 'text' : 'password'}
          value={s.value ?? ""}
          onChange={(e) => updateOne(s.key, e.target.value)}
          placeholder="Enter API key…"
          size="sm"
          sx={{ width: "100%" }}
          error={hasError || undefined}
          endDecorator={
            hasSavedValue && !isDirty ? (
              <IconButton
                variant="plain"
                size="sm"
                onClick={() => setShowApiKey(!showApiKey)}
                sx={{ mr: -0.5 }}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </IconButton>
            ) : null
          }
        />
      );
    }

    // text/url/number inputs
    return (
      <Input
        type={definition.type === 'number' ? 'number' : 'text'}
        value={s.value ?? ""}
        onChange={(e) => updateOne(s.key, e.target.value)}
        placeholder={definition.type === 'url' ? 'http://192.168.1.17:6969' : 'Enter value…'}
        size="sm"
        sx={{ width: "100%" }}
        error={hasError || undefined}
      />
    );
  };

  // Group settings by category for display
  const groupedSettings = useMemo(() => {
    if (!settings) return {};
    
    const categorized = getSettingsByCategory();
    const result: Record<string, Array<{ setting: Setting; definition: SettingDefinition }>> = {};
    
    Object.entries(categorized).forEach(([category, definitions]) => {
      result[category] = definitions.map(def => {
        const setting = settings.find(s => s.key === def.key);
        return { setting: setting!, definition: def };
      }).filter(item => item.setting);
    });
    
    return result;
  }, [settings]);

  // Group settings by tab
  const tabGroupedSettings = useMemo(() => {
    const tabs = {
      configuration: [
        'Stash Integration',
        'Appearance',
        'Playback'
      ],
      automation: [
        'Smart Playlist Refresh',
        'Database Maintenance'
      ],
      backup: [
        'Database Backup'
      ],
      recommendedTags: [
        'Recommended Tags'
      ]
    };

    const result: Record<string, Record<string, Array<{ setting: Setting; definition: SettingDefinition }>>> = {
      configuration: {},
      automation: {},
      backup: {},
      recommendedTags: {}
    };

    Object.entries(tabs).forEach(([tab, categories]) => {
      categories.forEach(category => {
        if (groupedSettings[category]) {
          result[tab][category] = groupedSettings[category];
        }
      });
    });

    return result;
  }, [groupedSettings]);

  return (
    <Sheet sx={{ p: 2, maxWidth: 1000, mx: "auto" }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3, flexWrap: "wrap" }}>
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
          Reset all changes
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
        <Typography color="danger" level="body-sm" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      {/* Settings by Category */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Box key={i} sx={{ p: 2, border: '1px solid', borderColor: 'neutral.outlinedBorder', borderRadius: 'lg' }}>
              <Skeleton variant="text" width="200px" height="24px" sx={{ mb: 2 }} />
              {Array.from({ length: 2 }).map((_, j) => (
                <Box key={j} sx={{ mb: 2 }}>
                  <Skeleton variant="text" width="150px" height="20px" sx={{ mb: 1 }} />
                  <Skeleton variant="rectangular" height="40px" />
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      ) : (
        <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value as number)}>
          <TabList>
            <Tab>Configuration</Tab>
            <Tab>Automation</Tab>
            <Tab>Backup</Tab>
            <Tab>Recommended Tags</Tab>
            <Tab>Templates</Tab>
          </TabList>

          {/* Configuration Tab */}
          <TabPanel value={0}>
            {Object.entries(tabGroupedSettings.configuration).map(([category, items]) => (
              <Box key={category} sx={{ mb: 4 }}>
                <Typography level="title-lg" sx={{ mb: 3 }}>{category}</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {items.map(({ setting, definition }) => {
                    const origVal = original?.find((o) => o.key === setting.key)?.value ?? "";
                    const dirty = (setting.value ?? "") !== origVal;
                    const hasError = !!validationErrors[setting.key];
                    
                    return (
                      <FormControl key={setting.key} error={hasError || undefined}>
                        <FormLabel>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {definition.label}
                            {definition.required && (
                              <Typography color="danger" level="body-sm">*</Typography>
                            )}
                            {dirty && (
                              <Chip size="sm" color="warning" variant="soft">
                                Modified
                              </Chip>
                            )}
                          </Box>
                        </FormLabel>
                        
                        <Box sx={{ display: 'flex', alignItems: 'start', gap: 1, mb: 1 }}>
                          <Box sx={{ flexGrow: 1 }}>
                            {renderEditor(setting, definition)}
                          </Box>
                          
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {dirty && (
                              <Tooltip title="Revert to saved value">
                                <IconButton size="sm" variant="plain" onClick={() => resetOne(setting.key)}>
                                  <RotateCcw size={16} />
                                </IconButton>
                              </Tooltip>
                            )}
                            
                            <Tooltip title="Reset to default value">
                              <IconButton size="sm" variant="plain" onClick={() => resetToDefault(setting.key)}>
                                <RefreshCw size={16} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                        
                        {hasError ? (
                          <FormHelperText>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <AlertCircle size={16} />
                              {validationErrors[setting.key]}
                            </Box>
                          </FormHelperText>
                        ) : (
                          <FormHelperText>{definition.description}</FormHelperText>
                        )}
                        
                        <Typography level="body-xs" sx={{ color: "text.tertiary", mt: 0.5 }}>
                          Last updated: {fmt(setting.updatedAt)}
                        </Typography>
                      </FormControl>
                    );
                  })}
                  
                  {/* Add test connection for Stash Integration category */}
                  {category === 'Stash Integration' && (
                    <Box sx={{ borderTop: '1px solid', borderColor: 'neutral.outlinedBorder', pt: 3, mt: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Button
                          startDecorator={testingConnection ? <RefreshCw className="animate-spin" size={16} /> : <Wifi size={16} />}
                          onClick={testConnection}
                          disabled={testingConnection}
                          variant="soft"
                          color="primary"
                        >
                          {testingConnection ? 'Testing...' : 'Test Connection'}
                        </Button>
                        
                        {connectionResult && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {connectionResult.success ? (
                              <Chip
                                startDecorator={<Wifi size={14} />}
                                color="success"
                                variant="soft"
                              >
                                Connected
                              </Chip>
                            ) : (
                              <Chip
                                startDecorator={<WifiOff size={14} />}
                                color="danger"
                                variant="soft"
                              >
                                Failed
                              </Chip>
                            )}
                          </Box>
                        )}
                      </Box>
                      
                      {connectionResult && (
                        <Box sx={{ p: 2, borderRadius: 'md', bgcolor: connectionResult.success ? 'success.50' : 'danger.50' }}>
                          <Typography level="body-sm" fontWeight="lg" sx={{ mb: 1 }}>
                            {connectionResult.success ? connectionResult.message : connectionResult.message || 'Connection failed'}
                          </Typography>
                          
                          {connectionResult.success && connectionResult.version && (
                            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                              Stash Version: {connectionResult.version}
                            </Typography>
                          )}
                          
                          {!connectionResult.success && connectionResult.details && (
                            <Typography level="body-xs" sx={{ color: 'text.secondary', mt: 0.5 }}>
                              {connectionResult.details}
                            </Typography>
                          )}
                        </Box>
                      )}
                    </Box>
                  )}
                  
                  {/* Add backup controls for Database Backup category */}
                  {category === 'Database Backup' && (
                    <Box sx={{ borderTop: '1px solid', borderColor: 'neutral.outlinedBorder', pt: 3, mt: 2 }}>
                      <Typography level="title-md" sx={{ mb: 2 }}>
                        Backup Management
                      </Typography>
                      
                      {/* Backup Status */}
                      {backupStatus && (
                        <Box sx={{ mb: 3, p: 2, borderRadius: 'md', bgcolor: 'background.level1' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Database size={16} />
                            <Typography level="body-sm" fontWeight="lg">
                              Status: {backupStatus.enabled ? 'Enabled' : 'Disabled'}
                            </Typography>
                          </Box>
                          
                          {backupStatus.lastBackup && (
                            <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 0.5 }}>
                              Last backup: {new Date(backupStatus.lastBackup).toLocaleString()}
                            </Typography>
                          )}
                          
                          {backupStatus.nextBackup && backupStatus.enabled && (
                            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                              Next backup: {new Date(backupStatus.nextBackup).toLocaleString()}
                            </Typography>
                          )}
                        </Box>
                      )}
                      
                      {/* Manual Backup Controls */}
                      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                        <Button
                          startDecorator={backupLoading ? <RefreshCw className="animate-spin" size={16} /> : <Database size={16} />}
                          onClick={() => handleBackupAction('create')}
                          disabled={backupLoading}
                          variant="solid"
                          color="primary"
                        >
                          {backupLoading ? 'Creating...' : 'Create Backup Now'}
                        </Button>
                        
                        <Button
                          startDecorator={<Trash2 size={16} />}
                          onClick={() => handleBackupAction('cleanup')}
                          disabled={backupLoading}
                          variant="outlined"
                          color="neutral"
                        >
                          Cleanup Old Backups
                        </Button>
                      </Box>
                      
                      {/* Backup Files List */}
                      {backups.length > 0 && (
                        <Box>
                          <Typography level="title-sm" sx={{ mb: 2 }}>
                            Available Backups ({backups.length})
                          </Typography>
                          
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 300, overflowY: 'auto' }}>
                            {backups.map((backup) => (
                              <Box
                                key={backup.filename}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 2,
                                  p: 2,
                                  border: '1px solid',
                                  borderColor: 'neutral.outlinedBorder',
                                  borderRadius: 'md',
                                  bgcolor: 'background.surface',
                                }}
                              >
                                <Box sx={{ flexGrow: 1 }}>
                                  <Typography level="body-sm" fontWeight="lg">
                                    {backup.filename}
                                  </Typography>
                                  <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                                    {new Date(backup.created).toLocaleString()} • {backup.sizeFormatted}
                                  </Typography>
                                </Box>
                                
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                  <Tooltip title="Restore from this backup">
                                    <IconButton
                                      size="sm"
                                      variant="soft"
                                      color="warning"
                                      onClick={() => {
                                        if (confirm(`Are you sure you want to restore from ${backup.filename}? This will replace your current database and cannot be undone.`)) {
                                          handleBackupAction('restore', backup.filename);
                                        }
                                      }}
                                      disabled={backupLoading}
                                    >
                                      <Upload size={16} />
                                    </IconButton>
                                  </Tooltip>
                                  
                                  <Tooltip title="Delete this backup">
                                    <IconButton
                                      size="sm"
                                      variant="soft"
                                      color="danger"
                                      onClick={() => {
                                        if (confirm(`Are you sure you want to delete ${backup.filename}? This cannot be undone.`)) {
                                          handleBackupAction('delete', backup.filename);
                                        }
                                      }}
                                      disabled={backupLoading}
                                    >
                                      <Trash2 size={16} />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Add refresh controls for Smart Playlist Refresh category */}
                  {category === 'Smart Playlist Refresh' && (
                    <Box sx={{ borderTop: '1px solid', borderColor: 'neutral.outlinedBorder', pt: 3, mt: 2 }}>
                      <Typography level="title-md" sx={{ mb: 2 }}>
                        Refresh Management
                      </Typography>
                      
                      {/* Refresh Status */}
                      {refreshStatus && (
                        <Box sx={{ mb: 3, p: 2, borderRadius: 'md', bgcolor: 'background.level1' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <RefreshCcw size={16} />
                            <Typography level="body-sm" fontWeight="lg">
                              Status: {refreshStatus.enabled ? 'Enabled' : 'Disabled'}
                            </Typography>
                            {refreshStatus.isRunning && (
                              <Chip size="sm" variant="soft" color="warning">
                                Running
                              </Chip>
                            )}
                          </Box>
                          
                          {refreshStatus.enabled && (
                            <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 0.5 }}>
                              {refreshStatus.interval === 'hourly' ? (
                                'Interval: Every hour at the top of the hour (e.g., 1:00, 2:00, 3:00...)'
                              ) : refreshStatus.interval === 'weekly' ? (
                                `Interval: Weekly on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][refreshStatus.refreshDay || 0]} at ${refreshStatus.refreshHour}:00`
                              ) : (
                                `Interval: Daily at ${refreshStatus.refreshHour}:00`
                              )}
                            </Typography>
                          )}
                          
                          {refreshStatus.lastRefresh && (
                            <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 0.5 }}>
                              Last refresh: {new Date(refreshStatus.lastRefresh).toLocaleString()}
                            </Typography>
                          )}
                          
                          {refreshStatus.nextRefresh && refreshStatus.enabled && (
                            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                              Next refresh: {new Date(refreshStatus.nextRefresh).toLocaleString()}
                            </Typography>
                          )}
                        </Box>
                      )}
                      
                      {/* Manual Refresh Controls */}
                      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                        <Button
                          startDecorator={refreshLoading ? <RefreshCcw className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
                          onClick={handleRefreshAction}
                          disabled={refreshLoading}
                          variant="solid"
                          color="primary"
                        >
                          {refreshLoading ? 'Refreshing...' : 'Refresh All Smart Playlists'}
                        </Button>
                      </Box>
                      
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        Manual refresh will immediately update all smart playlists with new content from your Stash server. 
                        Automatic refresh runs on the schedule configured above when enabled.
                      </Typography>

                      {/* Refresh History */}
                      {refreshHistory.length > 0 && (
                        <Box sx={{ mt: 3 }}>
                          <Typography level="title-sm" sx={{ mb: 2 }}>
                            Recent Refresh History
                          </Typography>
                          
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 300, overflowY: 'auto' }}>
                            {refreshHistory.map((log) => (
                              <Box
                                key={log.id}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 2,
                                  p: 2,
                                  border: '1px solid',
                                  borderColor: 'neutral.outlinedBorder',
                                  borderRadius: 'md',
                                  bgcolor: 'background.surface',
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  {log.success ? (
                                    <Check size={16} style={{ color: 'green' }} />
                                  ) : (
                                    <AlertCircle size={16} style={{ color: 'red' }} />
                                  )}
                                  <Chip 
                                    size="sm" 
                                    variant="soft" 
                                    color={log.refreshType === 'scheduled' ? 'primary' : 'neutral'}
                                  >
                                    {log.refreshType}
                                  </Chip>
                                </Box>
                                
                                <Box sx={{ flexGrow: 1 }}>
                                  <Typography level="body-sm" fontWeight="lg">
                                    {log.success ? 
                                      `Successfully refreshed ${log.refreshedPlaylists} playlist(s)` : 
                                      `Failed - refreshed ${log.refreshedPlaylists} playlist(s)`
                                    }
                                  </Typography>
                                  <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                                    {new Date(log.createdAt).toLocaleString()} • {log.duration}ms
                                    {log.errors && log.errors.length > 0 && ` • ${log.errors.length} error(s)`}
                                  </Typography>
                                </Box>
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Add maintenance controls for Database Maintenance category */}
                  {category === 'Database Maintenance' && (
                    <Box sx={{ borderTop: '1px solid', borderColor: 'neutral.outlinedBorder', pt: 3, mt: 2 }}>
                      <Typography level="title-md" sx={{ mb: 2 }}>
                        Maintenance Management
                      </Typography>
                      
                      {/* Maintenance Status */}
                      {maintenanceStatus && (
                        <Box sx={{ mb: 3, p: 2, borderRadius: 'md', bgcolor: 'background.level1' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Database size={16} />
                            <Typography level="body-sm" fontWeight="lg">
                              Status: {maintenanceStatus.enabled ? 'Enabled' : 'Disabled'}
                            </Typography>
                            {maintenanceStatus.isRunning && (
                              <Chip size="sm" variant="soft" color="warning">
                                Running
                              </Chip>
                            )}
                          </Box>
                          
                          {maintenanceStatus.enabled && (
                            <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 0.5 }}>
                              Schedule: Daily at {maintenanceStatus.hour}:00 UTC
                            </Typography>
                          )}
                          
                          {maintenanceStatus.nextRun && maintenanceStatus.enabled && (
                            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                              Next run: {new Date(maintenanceStatus.nextRun).toLocaleString()}
                            </Typography>
                          )}
                          
                        </Box>
                      )}
                      
                      {/* Manual Maintenance Controls */}
                      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                        <Button
                          startDecorator={maintenanceLoading ? <RefreshCw className="animate-spin" size={16} /> : <Database size={16} />}
                          onClick={handleMaintenanceAction}
                          disabled={maintenanceLoading}
                          variant="solid"
                          color="primary"
                        >
                          {maintenanceLoading ? 'Checking...' : 'Run Maintenance Check'}
                        </Button>
                      </Box>
                      
                      <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 3 }}>
                        Maintenance checks verify that all markers in your database still have valid parent scenes in Stash. 
                        Orphaned markers are automatically removed to keep playlists clean.
                      </Typography>

                      {/* Maintenance History */}
                      {maintenanceHistory.length > 0 && (
                        <Box sx={{ mb: 3, p: 2, borderRadius: 'md', bgcolor: 'background.level1' }}>
                          <Typography level="title-sm" sx={{ mb: 2 }}>
                            Recent Maintenance History
                          </Typography>
                          
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 200, overflowY: 'auto' }}>
                            {maintenanceHistory.map((log) => (
                              <Box
                                key={log.id}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 2,
                                  p: 1.5,
                                  borderRadius: 'sm',
                                  bgcolor: log.success ? 'success.50' : 'danger.50',
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 'fit-content' }}>
                                  {log.success ? (
                                    <CheckCircle size={16} color="var(--joy-palette-success-500)" />
                                  ) : (
                                    <XCircle size={16} color="var(--joy-palette-danger-500)" />
                                  )}
                                </Box>
                                
                                <Box sx={{ flexGrow: 1 }}>
                                  <Typography level="body-sm" fontWeight="lg">
                                    {log.success ? 
                                      `${log.refreshedPlaylists} orphaned item(s) removed` : 
                                      `Maintenance failed`
                                    }
                                  </Typography>
                                  <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                                    {new Date(log.createdAt).toLocaleString()} • {log.duration}ms • {log.refreshType.replace('maintenance-', '')}
                                    {log.errors && log.errors.length > 0 && ` • ${log.errors.length} error(s)`}
                                  </Typography>
                                </Box>
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      )}

                      {/* Scene ID Backfill Section */}
                      <Box sx={{ borderTop: '1px solid', borderColor: 'neutral.outlinedBorder', pt: 3, mt: 3 }}>
                        <Typography level="title-sm" sx={{ mb: 2 }}>
                          Scene ID Backfill
                        </Typography>
                        
                        {backfillStatus && (
                          <Box sx={{ mb: 3, p: 2, borderRadius: 'md', bgcolor: 'background.level1' }}>
                            <Typography level="body-sm" fontWeight="lg" sx={{ mb: 1 }}>
                              Database Status
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 0.5 }}>
                              Total items: {backfillStatus.totalItems}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 0.5 }}>
                              Items with scene ID: {backfillStatus.itemsWithSceneId} ({backfillStatus.backfillPercentage}%)
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                              Items needing backfill: {backfillStatus.itemsNeedingBackfill}
                            </Typography>
                          </Box>
                        )}
                        
                        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                          <Button
                            startDecorator={backfillLoading ? <RefreshCw className="animate-spin" size={16} /> : <Upload size={16} />}
                            onClick={handleBackfillAction}
                            disabled={backfillLoading || (backfillStatus?.itemsNeedingBackfill || 0) === 0}
                            variant="outlined"
                            color="primary"
                          >
                            {backfillLoading ? 'Processing...' : 'Backfill Scene IDs'}
                          </Button>
                        </Box>
                        
                        <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                          Scene ID backfill extracts scene IDs from existing marker stream URLs to enable maintenance checks. 
                          This is a one-time operation for existing data. New markers automatically include scene IDs.
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </Box>
                
                {/* Add connection testing for Stash Integration category */}
                {category === 'Stash Integration' && (
                  <Box sx={{ borderTop: '1px solid', borderColor: 'neutral.outlinedBorder', pt: 3, mt: 2 }}>
                    <Button
                      startDecorator={testingConnection ? <RefreshCw className="animate-spin" size={16} /> : <Wifi size={16} />}
                      onClick={testConnection}
                      disabled={testingConnection}
                      variant="outlined"
                      color="primary"
                      sx={{ mb: 2 }}
                    >
                      {testingConnection ? 'Testing...' : 'Test Connection'}
                    </Button>
                    
                    {connectionResult && (
                      <Box sx={{ 
                        p: 2, 
                        borderRadius: 'md', 
                        bgcolor: connectionResult.success ? 'success.50' : 'danger.50',
                        border: '1px solid',
                        borderColor: connectionResult.success ? 'success.200' : 'danger.200'
                      }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          {connectionResult.success ? (
                            <Wifi size={16} color="var(--joy-palette-success-500)" />
                          ) : (
                            <WifiOff size={16} color="var(--joy-palette-danger-500)" />
                          )}
                          <Typography 
                            level="body-sm" 
                            fontWeight="lg"
                            color={connectionResult.success ? 'success' : 'danger'}
                          >
                            {connectionResult.message}
                          </Typography>
                        </Box>
                        
                        {connectionResult.success && connectionResult.version && (
                          <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                            Stash Version: {connectionResult.version}
                          </Typography>
                        )}
                        
                        {!connectionResult.success && connectionResult.details && (
                          <Typography level="body-xs" sx={{ color: 'text.secondary', mt: 0.5 }}>
                            {connectionResult.details}
                          </Typography>
                        )}
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            ))}
          </TabPanel>

          {/* Automation Tab */}
          <TabPanel value={1}>
            {Object.entries(tabGroupedSettings.automation).map(([category, items]) => (
              <Box key={category} sx={{ mb: 4 }}>
                <Typography level="title-lg" sx={{ mb: 3 }}>{category}</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {items.map(({ setting, definition }) => {
                    const origVal = original?.find((o) => o.key === setting.key)?.value ?? "";
                    const dirty = (setting.value ?? "") !== origVal;
                    const hasError = !!validationErrors[setting.key];
                    
                    return (
                      <FormControl key={setting.key} error={hasError || undefined}>
                        <FormLabel>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {definition.label}
                            {definition.required && (
                              <Typography color="danger" level="body-sm">*</Typography>
                            )}
                            {dirty && (
                              <Chip size="sm" color="warning" variant="soft">
                                Modified
                              </Chip>
                            )}
                          </Box>
                        </FormLabel>
                        
                        <Box sx={{ display: 'flex', alignItems: 'start', gap: 1, mb: 1 }}>
                          <Box sx={{ flexGrow: 1 }}>
                            {renderEditor(setting, definition)}
                          </Box>
                          
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {dirty && (
                              <Tooltip title="Revert to saved value">
                                <IconButton size="sm" variant="plain" onClick={() => resetOne(setting.key)}>
                                  <RotateCcw size={14} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </Box>
                        
                        <FormHelperText>
                          {hasError && (
                            <Typography color="danger" level="body-xs">
                              {validationErrors[setting.key]}
                            </Typography>
                          )}
                          <Typography level="body-xs" sx={{ opacity: 0.8 }}>
                            {definition.description}
                          </Typography>
                        </FormHelperText>
                      </FormControl>
                    );
                  })}
                </Box>
                
                {/* Add special controls for automation categories */}
                {category === 'Smart Playlist Refresh' && (
                  <Box sx={{ borderTop: '1px solid', borderColor: 'neutral.outlinedBorder', pt: 3, mt: 2 }}>
                    <Typography level="title-md" sx={{ mb: 2 }}>
                      Refresh Management
                    </Typography>
                    
                    {/* Refresh Status */}
                    {refreshStatus && (
                      <Box sx={{ mb: 3, p: 2, borderRadius: 'md', bgcolor: 'background.level1' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <RefreshCw size={16} />
                          <Typography level="body-sm" fontWeight="lg">
                            Status: {refreshStatus.enabled ? 'Enabled' : 'Disabled'}
                          </Typography>
                          {refreshStatus.isRunning && (
                            <Chip size="sm" variant="soft" color="primary">
                              Running
                            </Chip>
                          )}
                        </Box>
                        
                        {refreshStatus.lastRefresh && (
                          <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 0.5 }}>
                            Last refresh: {new Date(refreshStatus.lastRefresh).toLocaleString()}
                          </Typography>
                        )}
                        
                        {refreshStatus.nextRefresh && refreshStatus.enabled && (
                          <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                            Next refresh: {new Date(refreshStatus.nextRefresh).toLocaleString()}
                          </Typography>
                        )}
                      </Box>
                    )}
                    
                    {/* Manual Refresh Controls */}
                    <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                      <Button
                        startDecorator={refreshLoading ? <RefreshCw className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
                        onClick={handleRefreshAction}
                        disabled={refreshLoading}
                        variant="solid"
                        color="primary"
                      >
                        {refreshLoading ? 'Refreshing...' : 'Refresh All Playlists Now'}
                      </Button>
                    </Box>
                    
                    {/* Refresh History */}
                    {refreshHistory.length > 0 && (
                      <Box sx={{ mb: 3, p: 2, borderRadius: 'md', bgcolor: 'background.level1' }}>
                        <Typography level="title-sm" sx={{ mb: 2 }}>
                          Recent Refresh History
                        </Typography>
                        
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 200, overflowY: 'auto' }}>
                          {refreshHistory.map((log) => (
                            <Box
                              key={log.id}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2,
                                p: 1.5,
                                borderRadius: 'sm',
                                bgcolor: log.success ? 'success.50' : 'danger.50',
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 'fit-content' }}>
                                {log.success ? (
                                  <CheckCircle size={16} color="var(--joy-palette-success-500)" />
                                ) : (
                                  <XCircle size={16} color="var(--joy-palette-danger-500)" />
                                )}
                              </Box>
                              
                              <Box sx={{ flexGrow: 1 }}>
                                <Typography level="body-sm" fontWeight="lg">
                                  {log.success ? 
                                    `${log.refreshedPlaylists} playlist(s) refreshed` : 
                                    `Refresh failed`
                                  }
                                </Typography>
                                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                                  {new Date(log.createdAt).toLocaleString()} • {log.duration}ms • {log.refreshType.replace('refresh-', '')}
                                  {log.errors && log.errors.length > 0 && ` • ${log.errors.length} error(s)`}
                                </Typography>
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                )}
                
                {category === 'Database Maintenance' && (
                  <Box sx={{ borderTop: '1px solid', borderColor: 'neutral.outlinedBorder', pt: 3, mt: 2 }}>
                    <Typography level="title-md" sx={{ mb: 2 }}>
                      Maintenance Management
                    </Typography>
                    
                    {/* Maintenance Status */}
                    {maintenanceStatus && (
                      <Box sx={{ mb: 3, p: 2, borderRadius: 'md', bgcolor: 'background.level1' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Database size={16} />
                          <Typography level="body-sm" fontWeight="lg">
                            Status: {maintenanceStatus.enabled ? 'Enabled' : 'Disabled'}
                          </Typography>
                        </Box>
                        
                        {maintenanceStatus.nextRun && maintenanceStatus.enabled && (
                          <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                            Next maintenance: {new Date(maintenanceStatus.nextRun).toLocaleString()}
                          </Typography>
                        )}
                      </Box>
                    )}
                    
                    {/* Manual Maintenance Controls */}
                    <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                      <Button
                        startDecorator={maintenanceLoading ? <RefreshCw className="animate-spin" size={16} /> : <Database size={16} />}
                        onClick={handleMaintenanceAction}
                        disabled={maintenanceLoading}
                        variant="solid"
                        color="primary"
                      >
                        {maintenanceLoading ? 'Checking...' : 'Run Maintenance Check'}
                      </Button>
                    </Box>
                    
                    <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 3 }}>
                      Maintenance checks verify that all markers in your database still have valid parent scenes in Stash. 
                      Orphaned markers are automatically removed to keep playlists clean.
                    </Typography>

                    {/* Maintenance History */}
                    {maintenanceHistory.length > 0 && (
                      <Box sx={{ mb: 3, p: 2, borderRadius: 'md', bgcolor: 'background.level1' }}>
                        <Typography level="title-sm" sx={{ mb: 2 }}>
                          Recent Maintenance History
                        </Typography>
                        
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 200, overflowY: 'auto' }}>
                          {maintenanceHistory.map((log) => (
                            <Box
                              key={log.id}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2,
                                p: 1.5,
                                borderRadius: 'sm',
                                bgcolor: log.success ? 'success.50' : 'danger.50',
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 'fit-content' }}>
                                {log.success ? (
                                  <CheckCircle size={16} color="var(--joy-palette-success-500)" />
                                ) : (
                                  <XCircle size={16} color="var(--joy-palette-danger-500)" />
                                )}
                              </Box>
                              
                              <Box sx={{ flexGrow: 1 }}>
                                <Typography level="body-sm" fontWeight="lg">
                                  {log.success ? 
                                    `${log.refreshedPlaylists} orphaned item(s) removed` : 
                                    `Maintenance failed`
                                  }
                                </Typography>
                                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                                  {new Date(log.createdAt).toLocaleString()} • {log.duration}ms • {log.refreshType.replace('maintenance-', '')}
                                  {log.errors && log.errors.length > 0 && ` • ${log.errors.length} error(s)`}
                                </Typography>
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    )}

                    {/* Scene ID Backfill Section */}
                    <Box sx={{ borderTop: '1px solid', borderColor: 'neutral.outlinedBorder', pt: 3, mt: 3 }}>
                      <Typography level="title-sm" sx={{ mb: 2 }}>
                        Scene ID Backfill
                      </Typography>
                      
                      {backfillStatus && (
                        <Box sx={{ mb: 3, p: 2, borderRadius: 'md', bgcolor: 'background.level1' }}>
                          <Typography level="body-sm" fontWeight="lg" sx={{ mb: 1 }}>
                            Database Status
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 0.5 }}>
                            Total items: {backfillStatus.totalItems}
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 0.5 }}>
                            Items with scene ID: {backfillStatus.itemsWithSceneId} ({backfillStatus.backfillPercentage}%)
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                            Items needing backfill: {backfillStatus.itemsNeedingBackfill}
                          </Typography>
                        </Box>
                      )}
                      
                      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                        <Button
                          startDecorator={backfillLoading ? <RefreshCw className="animate-spin" size={16} /> : <Upload size={16} />}
                          onClick={handleBackfillAction}
                          disabled={backfillLoading || (backfillStatus?.itemsNeedingBackfill || 0) === 0}
                          variant="outlined"
                          color="primary"
                        >
                          {backfillLoading ? 'Processing...' : 'Backfill Scene IDs'}
                        </Button>
                      </Box>
                      
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        Scene ID backfill extracts scene IDs from existing marker stream URLs to enable maintenance checks. 
                        This is a one-time operation for existing data. New markers automatically include scene IDs.
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Box>
            ))}
          </TabPanel>

          {/* Backup Tab */}
          <TabPanel value={2}>
            {Object.entries(tabGroupedSettings.backup).map(([category, items]) => (
              <Box key={category} sx={{ mb: 4 }}>
                <Typography level="title-lg" sx={{ mb: 3 }}>{category}</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {items.map(({ setting, definition }) => {
                    const origVal = original?.find((o) => o.key === setting.key)?.value ?? "";
                    const dirty = (setting.value ?? "") !== origVal;
                    const hasError = !!validationErrors[setting.key];
                    
                    return (
                      <FormControl key={setting.key} error={hasError || undefined}>
                        <FormLabel>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {definition.label}
                            {definition.required && (
                              <Typography color="danger" level="body-sm">*</Typography>
                            )}
                            {dirty && (
                              <Chip size="sm" color="warning" variant="soft">
                                Modified
                              </Chip>
                            )}
                          </Box>
                        </FormLabel>
                        
                        <Box sx={{ display: 'flex', alignItems: 'start', gap: 1, mb: 1 }}>
                          <Box sx={{ flexGrow: 1 }}>
                            {renderEditor(setting, definition)}
                          </Box>
                          
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {dirty && (
                              <Tooltip title="Revert to saved value">
                                <IconButton size="sm" variant="plain" onClick={() => resetOne(setting.key)}>
                                  <RotateCcw size={14} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </Box>
                        
                        <FormHelperText>
                          {hasError && (
                            <Typography color="danger" level="body-xs">
                              {validationErrors[setting.key]}
                            </Typography>
                          )}
                          <Typography level="body-xs" sx={{ opacity: 0.8 }}>
                            {definition.description}
                          </Typography>
                        </FormHelperText>
                      </FormControl>
                    );
                  })}
                </Box>
                
                {/* Add backup controls for Database Backup category */}
                {category === 'Database Backup' && (
                  <Box sx={{ borderTop: '1px solid', borderColor: 'neutral.outlinedBorder', pt: 3, mt: 2 }}>
                    <Typography level="title-md" sx={{ mb: 2 }}>
                      Backup Management
                    </Typography>
                    
                    {/* Backup Status */}
                    {backupStatus && (
                      <Box sx={{ mb: 3, p: 2, borderRadius: 'md', bgcolor: 'background.level1' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Database size={16} />
                          <Typography level="body-sm" fontWeight="lg">
                            Status: {backupStatus.enabled ? 'Enabled' : 'Disabled'}
                          </Typography>
                        </Box>
                        
                        {backupStatus.lastBackup && (
                          <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 0.5 }}>
                            Last backup: {new Date(backupStatus.lastBackup).toLocaleString()}
                          </Typography>
                        )}
                        
                        {backupStatus.nextBackup && backupStatus.enabled && (
                          <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                            Next backup: {new Date(backupStatus.nextBackup).toLocaleString()}
                          </Typography>
                        )}
                      </Box>
                    )}
                    
                    {/* Manual Backup Controls */}
                    <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                      <Button
                        startDecorator={backupLoading ? <RefreshCw className="animate-spin" size={16} /> : <Database size={16} />}
                        onClick={() => handleBackupAction('create')}
                        disabled={backupLoading}
                        variant="solid"
                        color="primary"
                      >
                        {backupLoading ? 'Creating...' : 'Create Backup Now'}
                      </Button>
                      
                      <Button
                        startDecorator={<Trash2 size={16} />}
                        onClick={() => handleBackupAction('cleanup')}
                        disabled={backupLoading}
                        variant="outlined"
                        color="neutral"
                      >
                        Cleanup Old Backups
                      </Button>
                    </Box>
                    
                    {/* Backup Files List */}
                    {backups.length > 0 && (
                      <Box>
                        <Typography level="title-sm" sx={{ mb: 2 }}>
                          Available Backups ({backups.length})
                        </Typography>
                        
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 300, overflowY: 'auto' }}>
                          {backups.map((backup) => (
                            <Box
                              key={backup.filename}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2,
                                p: 2,
                                border: '1px solid',
                                borderColor: 'neutral.outlinedBorder',
                                borderRadius: 'md',
                                bgcolor: 'background.surface',
                              }}
                            >
                              <Box sx={{ flexGrow: 1 }}>
                                <Typography level="body-sm" fontWeight="lg">
                                  {backup.filename}
                                </Typography>
                                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                                  {new Date(backup.created).toLocaleString()} • {backup.sizeFormatted}
                                </Typography>
                              </Box>
                              
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <Tooltip title="Restore from this backup">
                                  <IconButton
                                    size="sm"
                                    variant="soft"
                                    color="warning"
                                    onClick={() => {
                                      if (confirm(`Are you sure you want to restore from ${backup.filename}? This will replace your current database and cannot be undone.`)) {
                                        handleBackupAction('restore', backup.filename);
                                      }
                                    }}
                                    disabled={backupLoading}
                                  >
                                    <Upload size={16} />
                                  </IconButton>
                                </Tooltip>
                                
                                <Tooltip title="Delete this backup">
                                  <IconButton
                                    size="sm"
                                    variant="soft"
                                    color="danger"
                                    onClick={() => {
                                      if (confirm(`Are you sure you want to delete ${backup.filename}? This cannot be undone.`)) {
                                        handleBackupAction('delete', backup.filename);
                                      }
                                    }}
                                    disabled={backupLoading}
                                  >
                                    <Trash2 size={16} />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            ))}
          </TabPanel>

          {/* Recommended Tags Tab */}
          <TabPanel value={3}>
            {Object.entries(tabGroupedSettings.recommendedTags).map(([category, items]) => (
              <Box key={category} sx={{ mb: 4 }}>
                <Typography level="title-lg" sx={{ mb: 2 }}>{category}</Typography>
                <Typography level="body-sm" sx={{ color: "text.secondary", mb: 3 }}>
                  Configure tag recommendations based on performer count. These suggestions appear when editing scene markers.
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {items.map(({ setting, definition }) => {
                    const origVal = original?.find((o) => o.key === setting.key)?.value ?? "";
                    const dirty = (setting.value ?? "") !== origVal;
                    const hasError = !!validationErrors[setting.key];

                    return (
                      <FormControl key={setting.key} error={hasError || undefined}>
                        <FormLabel>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {definition.label}
                            {dirty && (
                              <Chip size="sm" color="warning" variant="soft">
                                Modified
                              </Chip>
                            )}
                          </Box>
                        </FormLabel>

                        <Box sx={{ display: 'flex', alignItems: 'start', gap: 1, mb: 1 }}>
                          <Box sx={{ flexGrow: 1 }}>
                            {renderEditor(setting, definition)}
                          </Box>

                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {dirty && (
                              <Tooltip title="Revert to saved value">
                                <IconButton size="sm" variant="plain" onClick={() => resetOne(setting.key)}>
                                  <RotateCcw size={16} />
                                </IconButton>
                              </Tooltip>
                            )}

                            <Tooltip title="Reset to default value">
                              <IconButton size="sm" variant="plain" onClick={() => resetToDefault(setting.key)}>
                                <RefreshCw size={16} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>

                        {hasError ? (
                          <FormHelperText>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <AlertCircle size={16} />
                              {validationErrors[setting.key]}
                            </Box>
                          </FormHelperText>
                        ) : (
                          <FormHelperText>{definition.description}</FormHelperText>
                        )}

                        <Typography level="body-xs" sx={{ color: "text.tertiary", mt: 0.5 }}>
                          Last updated: {fmt(setting.updatedAt)}
                        </Typography>
                      </FormControl>
                    );
                  })}
                </Box>
              </Box>
            ))}
          </TabPanel>

          {/* Templates Tab */}
          <TabPanel value={4}>
            <TemplateManager />
          </TabPanel>
        </Tabs>
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
