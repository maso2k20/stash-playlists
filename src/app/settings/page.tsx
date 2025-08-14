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
} from "@mui/joy";
import { useColorScheme } from "@mui/joy/styles";
import { Check, RotateCcw, Save, RefreshCw, ChevronDown, AlertCircle, Wifi, WifiOff, Database, Download, Trash2, Upload } from "lucide-react";
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
      
      // Refresh to sync updatedAt, also re-apply theme from server source of truth
      await load();
      await loadBackupInfo();
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
    setBackupLoading(true);
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, filename }),
      });
      
      const result = await res.json();
      
      if (result.success) {
        setSnack({ 
          open: true, 
          msg: result.message, 
          color: 'success' 
        });
        await loadBackupInfo();
      } else {
        setSnack({ 
          open: true, 
          msg: result.error || 'Operation failed', 
          color: 'danger' 
        });
      }
    } catch (error) {
      setSnack({ 
        open: true, 
        msg: 'Operation failed', 
        color: 'danger' 
      });
    } finally {
      setBackupLoading(false);
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
            <Box key={i} sx={{ p: 2, border: '1px solid', borderColor: 'neutral.200', borderRadius: 'lg' }}>
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
        <AccordionGroup size="lg">
          {Object.entries(groupedSettings).map(([category, items]) => (
            <Accordion key={category} defaultExpanded>
              <AccordionSummary indicator={<ChevronDown />}>
                <Typography level="title-lg">{category}</Typography>
              </AccordionSummary>
              <AccordionDetails>
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
                        
                        <Typography level="body-xs" sx={{ color: "neutral.500", mt: 0.5 }}>
                          Last updated: {fmt(setting.updatedAt)}
                        </Typography>
                      </FormControl>
                    );
                  })}
                  
                  {/* Add test connection for Stash Integration category */}
                  {category === 'Stash Integration' && (
                    <Box sx={{ borderTop: '1px solid', borderColor: 'neutral.200', pt: 3, mt: 2 }}>
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
                            <Typography level="body-xs" sx={{ color: 'neutral.600' }}>
                              Stash Version: {connectionResult.version}
                            </Typography>
                          )}
                          
                          {!connectionResult.success && connectionResult.details && (
                            <Typography level="body-xs" sx={{ color: 'neutral.600', mt: 0.5 }}>
                              {connectionResult.details}
                            </Typography>
                          )}
                        </Box>
                      )}
                    </Box>
                  )}
                  
                  {/* Add backup controls for Database Backup category */}
                  {category === 'Database Backup' && (
                    <Box sx={{ borderTop: '1px solid', borderColor: 'neutral.200', pt: 3, mt: 2 }}>
                      <Typography level="title-md" sx={{ mb: 2 }}>
                        Backup Management
                      </Typography>
                      
                      {/* Backup Status */}
                      {backupStatus && (
                        <Box sx={{ mb: 3, p: 2, borderRadius: 'md', bgcolor: 'neutral.50' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Database size={16} />
                            <Typography level="body-sm" fontWeight="lg">
                              Status: {backupStatus.enabled ? 'Enabled' : 'Disabled'}
                            </Typography>
                          </Box>
                          
                          {backupStatus.lastBackup && (
                            <Typography level="body-xs" sx={{ color: 'neutral.600', mb: 0.5 }}>
                              Last backup: {new Date(backupStatus.lastBackup).toLocaleString()}
                            </Typography>
                          )}
                          
                          {backupStatus.nextBackup && backupStatus.enabled && (
                            <Typography level="body-xs" sx={{ color: 'neutral.600' }}>
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
                                  borderColor: 'neutral.200',
                                  borderRadius: 'md',
                                  bgcolor: 'background.surface',
                                }}
                              >
                                <Box sx={{ flexGrow: 1 }}>
                                  <Typography level="body-sm" fontWeight="lg">
                                    {backup.filename}
                                  </Typography>
                                  <Typography level="body-xs" sx={{ color: 'neutral.600' }}>
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
              </AccordionDetails>
            </Accordion>
          ))}
        </AccordionGroup>
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
