// src/lib/settingsDefinitions.ts

export type SettingType = 'text' | 'url' | 'select' | 'number';

export type SettingDefinition = {
  key: string;
  defaultValue: string;
  type: SettingType;
  category: string;
  label: string;
  description: string;
  required: boolean;
  options?: string[]; // for select type
  validation?: (value: string) => string | null; // returns error message or null
};

export const SETTING_CATEGORIES = {
  STASH_INTEGRATION: 'Stash Integration',
  APPEARANCE: 'Appearance',
  PLAYBACK: 'Playback',
  SMART_PLAYLIST_REFRESH: 'Smart Playlist Refresh',
  BACKUP: 'Database Backup',
} as const;

// URL validation helper
const validateUrl = (value: string): string | null => {
  if (!value.trim()) return null;
  try {
    // Support URLs without protocol (assume http)
    const urlToTest = /^https?:\/\//i.test(value) ? value : `http://${value}`;
    new URL(urlToTest);
    return null;
  } catch {
    return 'Please enter a valid URL (e.g., http://192.168.1.17:6969)';
  }
};

export const SETTINGS_DEFINITIONS: SettingDefinition[] = [
  {
    key: 'STASH_SERVER',
    defaultValue: '',
    type: 'url',
    category: SETTING_CATEGORIES.STASH_INTEGRATION,
    label: 'Stash Server URL',
    description: 'The base URL of your Stash server (e.g., http://192.168.1.17:6969 or http://localhost:9999)',
    required: true,
    validation: (value) => {
      if (!value.trim()) return 'Stash Server URL is required for the app to function';
      return validateUrl(value);
    },
  },
  {
    key: 'STASH_API',
    defaultValue: '',
    type: 'text',
    category: SETTING_CATEGORIES.STASH_INTEGRATION,
    label: 'Stash API Key',
    description: 'Your Stash API key for authentication. Find this in Stash under Settings → Configuration → Authentication',
    required: true,
    validation: (value) => {
      if (!value.trim()) return 'Stash API key is required for authentication';
      if (value.length < 10) return 'API key appears too short - please check it\'s correct';
      return null;
    },
  },
  {
    key: 'THEME_MODE',
    defaultValue: 'system',
    type: 'select',
    category: SETTING_CATEGORIES.APPEARANCE,
    label: 'Theme',
    description: 'Choose your preferred theme. System will match your device\'s theme setting',
    required: false,
    options: ['light', 'dark', 'system'],
  },
  {
    key: 'DEFAULT_CLIP_BEFORE',
    defaultValue: '0',
    type: 'number',
    category: SETTING_CATEGORIES.PLAYBACK,
    label: 'Default Seconds Before Marker',
    description: 'How many seconds before a marker to start video clips in smart playlists. Use 0 if marker times are already correct.',
    required: false,
    validation: (value) => {
      const num = parseInt(value);
      if (isNaN(num)) return 'Must be a number';
      if (num < 0) return 'Cannot be negative';
      if (num > 300) return 'Maximum 300 seconds (5 minutes)';
      return null;
    },
  },
  {
    key: 'DEFAULT_CLIP_AFTER',
    defaultValue: '0',
    type: 'number',
    category: SETTING_CATEGORIES.PLAYBACK,
    label: 'Default Seconds After Marker',
    description: 'How many seconds after a marker to end video clips in smart playlists. Use 0 if marker times are already correct.',
    required: false,
    validation: (value) => {
      const num = parseInt(value);
      if (isNaN(num)) return 'Must be a number';
      if (num < 0) return 'Cannot be negative';
      if (num > 300) return 'Maximum 300 seconds (5 minutes)';
      return null;
    },
  },
  {
    key: 'BACKUP_ENABLED',
    defaultValue: 'true',
    type: 'select',
    category: SETTING_CATEGORIES.BACKUP,
    label: 'Enable Automatic Backups',
    description: 'Automatically create daily backups of your database',
    required: false,
    options: ['true', 'false'],
  },
  {
    key: 'BACKUP_RETENTION_DAYS',
    defaultValue: '7',
    type: 'number',
    category: SETTING_CATEGORIES.BACKUP,
    label: 'Backup Retention (Days)',
    description: 'How many daily backups to keep before deleting old ones',
    required: false,
    validation: (value) => {
      const num = parseInt(value);
      if (isNaN(num)) return 'Must be a number';
      if (num < 1) return 'Must keep at least 1 backup';
      if (num > 365) return 'Maximum 365 days retention';
      return null;
    },
  },
  {
    key: 'BACKUP_HOUR',
    defaultValue: '2',
    type: 'number',
    category: SETTING_CATEGORIES.BACKUP,
    label: 'Backup Time (Hour)',
    description: 'Hour of the day to run automatic backups (0-23, in server timezone)',
    required: false,
    validation: (value) => {
      const num = parseInt(value);
      if (isNaN(num)) return 'Must be a number';
      if (num < 0 || num > 23) return 'Must be between 0-23 (24-hour format)';
      return null;
    },
  },
  {
    key: 'SMART_PLAYLIST_REFRESH_ENABLED',
    defaultValue: 'false',
    type: 'select',
    category: SETTING_CATEGORIES.SMART_PLAYLIST_REFRESH,
    label: 'Enable Automatic Refresh',
    description: 'Automatically refresh smart playlists on a schedule to sync with new content in Stash',
    required: false,
    options: ['true', 'false'],
  },
  {
    key: 'SMART_PLAYLIST_REFRESH_INTERVAL',
    defaultValue: 'daily',
    type: 'select',
    category: SETTING_CATEGORIES.SMART_PLAYLIST_REFRESH,
    label: 'Refresh Interval',
    description: 'How often to automatically refresh smart playlists',
    required: false,
    options: ['hourly', 'daily', 'weekly'],
  },
  {
    key: 'SMART_PLAYLIST_REFRESH_HOUR',
    defaultValue: '3',
    type: 'number',
    category: SETTING_CATEGORIES.SMART_PLAYLIST_REFRESH,
    label: 'Refresh Time (Hour)',
    description: 'Hour of the day to run automatic refresh (0-23, in server timezone). Only used for daily and weekly intervals. Hourly refresh runs every hour regardless of this setting.',
    required: false,
    validation: (value) => {
      const num = parseInt(value);
      if (isNaN(num)) return 'Must be a number';
      if (num < 0 || num > 23) return 'Must be between 0-23 (24-hour format)';
      return null;
    },
  },
  {
    key: 'SMART_PLAYLIST_REFRESH_DAY',
    defaultValue: '0',
    type: 'select',
    category: SETTING_CATEGORIES.SMART_PLAYLIST_REFRESH,
    label: 'Refresh Day (Weekly)',
    description: 'Day of the week to run weekly refresh: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday',
    required: false,
    options: ['0', '1', '2', '3', '4', '5', '6'],
  },
];

// Helper to get setting definition by key
export function getSettingDefinition(key: string): SettingDefinition | undefined {
  return SETTINGS_DEFINITIONS.find(def => def.key === key);
}

// Helper to get all settings grouped by category
export function getSettingsByCategory(): Record<string, SettingDefinition[]> {
  const grouped: Record<string, SettingDefinition[]> = {};
  
  for (const setting of SETTINGS_DEFINITIONS) {
    if (!grouped[setting.category]) {
      grouped[setting.category] = [];
    }
    grouped[setting.category].push(setting);
  }
  
  return grouped;
}

// Helper to validate a setting value
export function validateSetting(key: string, value: string): string | null {
  const definition = getSettingDefinition(key);
  if (!definition) return null;
  
  return definition.validation ? definition.validation(value) : null;
}

// Helper to get default clip timing settings
export async function getDefaultClipSettings() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  
  try {
    const settings = await prisma.settings.findMany({
      where: { key: { in: ['DEFAULT_CLIP_BEFORE', 'DEFAULT_CLIP_AFTER'] } },
      select: { key: true, value: true },
    });
    
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
    
    return {
      before: Math.max(0, Number(settingsMap.DEFAULT_CLIP_BEFORE ?? '0')),
      after: Math.max(0, Number(settingsMap.DEFAULT_CLIP_AFTER ?? '0')),
    };
  } finally {
    await prisma.$disconnect();
  }
}