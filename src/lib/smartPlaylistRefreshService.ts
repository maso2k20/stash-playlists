// src/lib/smartPlaylistRefreshService.ts

import * as cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

export interface RefreshStatus {
  lastRefresh?: Date;
  nextRefresh?: Date;
  enabled: boolean;
  interval: string;
  refreshHour: number;
  refreshDay?: number;
  isRunning: boolean;
}

export interface RefreshResult {
  success: boolean;
  refreshedPlaylists: number;
  errors: string[];
  duration: number;
}

let cronJob: cron.ScheduledTask | null = null;
let isRefreshRunning = false;

// Get refresh settings from database
async function getRefreshSettings() {
  const prisma = new PrismaClient();
  try {
    const settings = await prisma.settings.findMany({
      where: { 
        key: { 
          in: [
            'SMART_PLAYLIST_REFRESH_ENABLED',
            'SMART_PLAYLIST_REFRESH_INTERVAL', 
            'SMART_PLAYLIST_REFRESH_HOUR',
            'SMART_PLAYLIST_REFRESH_DAY'
          ] 
        } 
      },
      select: { key: true, value: true },
    });
    
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
    
    return {
      enabled: settingsMap.SMART_PLAYLIST_REFRESH_ENABLED === 'true',
      interval: settingsMap.SMART_PLAYLIST_REFRESH_INTERVAL || 'daily',
      refreshHour: Math.max(0, Math.min(23, Number(settingsMap.SMART_PLAYLIST_REFRESH_HOUR || '3'))),
      refreshDay: Number(settingsMap.SMART_PLAYLIST_REFRESH_DAY || '0'), // 0 = Sunday
    };
  } finally {
    await prisma.$disconnect();
  }
}

// Refresh all smart playlists
export async function refreshAllSmartPlaylists(refreshType: 'manual' | 'scheduled' = 'manual'): Promise<RefreshResult> {
  if (isRefreshRunning) {
    return {
      success: false,
      refreshedPlaylists: 0,
      errors: ['Refresh is already running'],
      duration: 0,
    };
  }

  isRefreshRunning = true;
  const startTime = Date.now();
  const errors: string[] = [];
  let refreshedCount = 0;

  try {
    const prisma = new PrismaClient();
    
    try {
      // Get all smart playlists
      const smartPlaylists = await prisma.playlist.findMany({
        where: { type: 'SMART' },
        select: { id: true, name: true },
      });

      console.log(`[SmartPlaylistRefresh] ${refreshType} refresh started - Found ${smartPlaylists.length} smart playlists to refresh`);

      // Refresh each playlist
      for (const playlist of smartPlaylists) {
        try {
          // Call the refresh API endpoint internally
          const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/playlists/${playlist.id}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh: true }),
          });

          if (response.ok) {
            refreshedCount++;
            console.log(`[SmartPlaylistRefresh] Successfully refreshed playlist: ${playlist.name}`);
          } else {
            const errorText = await response.text();
            const error = `Failed to refresh playlist "${playlist.name}": ${response.status} ${errorText}`;
            errors.push(error);
            console.error(`[SmartPlaylistRefresh] ${error}`);
          }
        } catch (error) {
          const errorMsg = `Error refreshing playlist "${playlist.name}": ${error}`;
          errors.push(errorMsg);
          console.error(`[SmartPlaylistRefresh] ${errorMsg}`);
        }

        // Small delay between refreshes to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const duration = Date.now() - startTime;
      const success = errors.length === 0;

      // Log the refresh operation to database
      await prisma.refreshLog.create({
        data: {
          refreshType,
          success,
          refreshedPlaylists: refreshedCount,
          errors: errors.length > 0 ? errors : null,
          duration,
        },
      });

      console.log(`[SmartPlaylistRefresh] ${refreshType} refresh completed in ${duration}ms. Refreshed: ${refreshedCount}, Errors: ${errors.length}`);

      return {
        success,
        refreshedPlaylists: refreshedCount,
        errors,
        duration,
      };
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = `Refresh service error: ${error}`;
    console.error(`[SmartPlaylistRefresh] ${errorMsg}`);
    
    // Try to log the error to database
    try {
      const prisma = new PrismaClient();
      await prisma.refreshLog.create({
        data: {
          refreshType,
          success: false,
          refreshedPlaylists: refreshedCount,
          errors: [errorMsg],
          duration,
        },
      });
      await prisma.$disconnect();
    } catch (logError) {
      console.error(`[SmartPlaylistRefresh] Failed to log error to database:`, logError);
    }
    
    return {
      success: false,
      refreshedPlaylists: refreshedCount,
      errors: [errorMsg],
      duration,
    };
  } finally {
    isRefreshRunning = false;
  }
}

// Generate cron expression based on settings
function getCronExpression(interval: string, hour: number, day?: number): string {
  switch (interval) {
    case 'hourly':
      return '0 * * * *'; // Every hour at minute 0 (hour setting ignored)
    case 'weekly':
      return `0 ${hour} * * ${day || 0}`; // Weekly on specified day and hour
    case 'daily':
    default:
      return `0 ${hour} * * *`; // Daily at specified hour
  }
}

// Calculate next run time based on cron expression
function getNextRunTime(cronExpression: string): Date | null {
  try {
    const task = cron.schedule(cronExpression, () => {}, { scheduled: false });
    // Get next 2 dates (current might be past)
    const dates = task.getNextDates(2);
    task.destroy();
    return dates.length > 0 ? dates[0].toDate() : null;
  } catch (error) {
    console.error('[SmartPlaylistRefresh] Error calculating next run time:', error);
    return null;
  }
}

// Start the refresh scheduler
export async function startRefreshScheduler(): Promise<void> {
  // Stop existing job if running
  if (cronJob) {
    cronJob.destroy();
    cronJob = null;
  }

  const settings = await getRefreshSettings();
  
  if (!settings.enabled) {
    console.log('[SmartPlaylistRefresh] Scheduler disabled');
    return;
  }

  const cronExpression = getCronExpression(settings.interval, settings.refreshHour, settings.refreshDay);
  
  try {
    cronJob = cron.schedule(cronExpression, async () => {
      console.log('[SmartPlaylistRefresh] Starting scheduled refresh...');
      await refreshAllSmartPlaylists('scheduled');
    }, {
      scheduled: true,
      timezone: 'UTC' // Use UTC to match database timestamps
    });

    const nextRun = getNextRunTime(cronExpression);
    console.log(`[SmartPlaylistRefresh] Scheduler started with expression: ${cronExpression}`);
    console.log(`[SmartPlaylistRefresh] Next run: ${nextRun?.toISOString() || 'Unknown'}`);
  } catch (error) {
    console.error('[SmartPlaylistRefresh] Error starting scheduler:', error);
    throw error;
  }
}

// Stop the refresh scheduler
export function stopRefreshScheduler(): void {
  if (cronJob) {
    cronJob.destroy();
    cronJob = null;
    console.log('[SmartPlaylistRefresh] Scheduler stopped');
  }
}

// Restart the scheduler (useful when settings change)
export async function restartRefreshScheduler(): Promise<void> {
  stopRefreshScheduler();
  await startRefreshScheduler();
}

// Get current refresh status
export async function getRefreshStatus(): Promise<RefreshStatus> {
  const settings = await getRefreshSettings();
  
  let nextRefresh: Date | null = null;
  if (settings.enabled && cronJob) {
    const cronExpression = getCronExpression(settings.interval, settings.refreshHour, settings.refreshDay);
    nextRefresh = getNextRunTime(cronExpression);
  }

  // Get last refresh time from database
  let lastRefresh: Date | undefined = undefined;
  try {
    const prisma = new PrismaClient();
    const lastLog = await prisma.refreshLog.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    await prisma.$disconnect();
    
    if (lastLog) {
      lastRefresh = lastLog.createdAt;
    }
  } catch (error) {
    console.error('[SmartPlaylistRefresh] Failed to get last refresh time:', error);
  }
  
  return {
    lastRefresh,
    nextRefresh: nextRefresh || undefined,
    enabled: settings.enabled,
    interval: settings.interval,
    refreshHour: settings.refreshHour,
    refreshDay: settings.refreshDay,
    isRunning: isRefreshRunning,
  };
}

// Initialize the service (call this on app startup)
export async function initializeRefreshService(): Promise<void> {
  try {
    console.log('[SmartPlaylistRefresh] Initializing refresh service...');
    await startRefreshScheduler();
  } catch (error) {
    console.error('[SmartPlaylistRefresh] Failed to initialize refresh service:', error);
  }
}