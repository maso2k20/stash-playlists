// src/lib/maintenanceService.ts
import prisma from "@/lib/prisma";
import { stashGraph } from "@/lib/smartPlaylistServer";
import * as cron from 'node-cron';

type MaintenanceResult = {
  success: boolean;
  message: string;
  data: {
    totalItemsChecked: number;
    orphanedItemsFound: number;
    orphanedItemsRemoved: number;
    errors: string[];
    duration: number;
  };
};

export class MaintenanceService {
  private static instance: MaintenanceService;
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  private constructor() {}

  static getInstance(): MaintenanceService {
    if (!MaintenanceService.instance) {
      MaintenanceService.instance = new MaintenanceService();
    }
    return MaintenanceService.instance;
  }

  async getScheduleStatus() {
    try {
      const settings = await prisma.settings.findMany({
        where: {
          key: {
            in: ['MAINTENANCE_ENABLED', 'MAINTENANCE_HOUR']
          }
        }
      });

      const settingsMap = Object.fromEntries(
        settings.map(s => [s.key, s.value])
      );

      const enabled = settingsMap.MAINTENANCE_ENABLED === 'true';
      const hour = parseInt(settingsMap.MAINTENANCE_HOUR || '3');

      return {
        enabled,
        hour,
        isRunning: this.isRunning,
        nextRun: enabled ? this.getNextRunTime(hour) : null,
        cronActive: this.cronJob ? true : false
      };
    } catch (error) {
      console.error('❌ Failed to get maintenance schedule status:', error);
      return {
        enabled: false,
        hour: 3,
        isRunning: false,
        nextRun: null,
        cronActive: false
      };
    }
  }

  private getNextRunTime(hour: number): Date {
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(hour, 0, 0, 0);
    
    // If today's run time has passed, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    return nextRun;
  }

  async startScheduler() {
    try {
      console.log('🔧 Starting maintenance scheduler...');
      
      const status = await this.getScheduleStatus();
      
      if (!status.enabled) {
        console.log('🔧 Maintenance scheduler is disabled');
        this.stopScheduler();
        return;
      }

      // Stop existing cron job if running
      this.stopScheduler();

      // Schedule maintenance to run daily at the configured hour
      const cronExpression = `0 ${status.hour} * * *`; // minute hour day month weekday
      
      console.log(`🔧 Scheduling maintenance for ${status.hour}:00 UTC daily (${cronExpression})`);
      
      this.cronJob = cron.schedule(cronExpression, async () => {
        console.log('🔧 Running scheduled maintenance check...');
        try {
          const result = await this.runMaintenanceCheck();
          await this.logMaintenanceResult('scheduled', result);
        } catch (error) {
          console.error('❌ Scheduled maintenance failed:', error);
          await this.logMaintenanceResult('scheduled', {
            success: false,
            message: `Maintenance failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            data: {
              totalItemsChecked: 0,
              orphanedItemsFound: 0,
              orphanedItemsRemoved: 0,
              errors: [error instanceof Error ? error.message : 'Unknown error'],
              duration: 0
            }
          });
        }
      }, {
        timezone: "UTC"
      });

      console.log('✅ Maintenance scheduler started successfully');
      return { success: true, nextRun: status.nextRun };
    } catch (error) {
      console.error('❌ Failed to start maintenance scheduler:', error);
      throw error;
    }
  }

  stopScheduler() {
    if (this.cronJob) {
      console.log('🔧 Stopping maintenance scheduler...');
      this.cronJob.stop();
      this.cronJob.destroy();
      this.cronJob = null;
      console.log('✅ Maintenance scheduler stopped');
    }
  }

  async runMaintenanceCheck(): Promise<MaintenanceResult> {
    if (this.isRunning) {
      throw new Error('Maintenance check is already running');
    }

    const startTime = Date.now();
    this.isRunning = true;

    try {
      console.log('🔧 Starting maintenance check...');

      // Maintenance always removes orphaned items for clean playlists

      // Get all items with scene IDs that aren't already marked as orphaned
      const itemsToCheck = await prisma.item.findMany({
        where: {
          AND: [
            { sceneId: { not: null } },
            { orphaned: false }
          ]
        },
        select: { id: true, sceneId: true, title: true }
      });

      console.log(`🔧 Checking ${itemsToCheck.length} items for orphaned scenes...`);

      const orphanedItems: Array<{ id: string; sceneId: string | null; title: string }> = [];
      const errors: string[] = [];

      try {
        // Fetch all scenes from Stash at once (more efficient than batching)
        console.log('🔧 Fetching all scenes from Stash...');
        const query = `
          query CheckScenes {
            findScenes(
              filter: { per_page: -1 }
            ) {
              scenes {
                id
              }
            }
          }
        `;

        const result = await stashGraph<{
          findScenes: { scenes: Array<{ id: string }> }
        }>(query);

        const existingSceneIds = new Set(result.findScenes.scenes.map(s => s.id));
        console.log(`🔧 Found ${existingSceneIds.size} scenes in Stash`);

        // Check all items against the scene list
        for (const item of itemsToCheck) {
          if (item.sceneId && !existingSceneIds.has(item.sceneId)) {
            orphanedItems.push(item);
          }
        }
      } catch (error) {
        console.error(`❌ Error fetching scenes from Stash:`, error);
        errors.push(`Error fetching scenes: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      console.log(`🔧 Found ${orphanedItems.length} orphaned items`);

      let orphanedItemsRemoved = 0;

      if (orphanedItems.length > 0) {
        // Remove orphaned items completely
        const orphanedIds = orphanedItems.map(item => item.id);
        
        // First remove from playlists
        await prisma.playlistItem.deleteMany({
          where: { itemId: { in: orphanedIds } }
        });
        
        // Then remove the items themselves
        await prisma.item.deleteMany({
          where: { id: { in: orphanedIds } }
        });
        
        orphanedItemsRemoved = orphanedItems.length;
        console.log(`🗑️ Removed ${orphanedItemsRemoved} orphaned items`);
      }

      const duration = Date.now() - startTime;
      const result: MaintenanceResult = {
        success: true,
        message: `Maintenance completed: ${orphanedItems.length} orphaned items removed`,
        data: {
          totalItemsChecked: itemsToCheck.length,
          orphanedItemsFound: orphanedItems.length,
          orphanedItemsRemoved,
          errors,
          duration
        }
      };

      console.log('✅ Maintenance check completed:', result.data);
      return result;
    } catch (error) {
      console.error('❌ Maintenance check failed:', error);
      const duration = Date.now() - startTime;
      
      return {
        success: false,
        message: `Maintenance failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: {
          totalItemsChecked: 0,
          orphanedItemsFound: 0,
          orphanedItemsRemoved: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          duration
        }
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async logMaintenanceResult(type: 'manual' | 'scheduled', result: MaintenanceResult) {
    try {
      await prisma.refreshLog.create({
        data: {
          refreshType: `maintenance-${type}`,
          success: result.success,
          refreshedPlaylists: result.data.orphanedItemsRemoved, // Use this field to store orphaned items count
          errors: result.data.errors.length > 0 ? result.data.errors : undefined,
          duration: result.data.duration
        }
      });
    } catch (error) {
      console.error('❌ Failed to log maintenance result:', error);
    }
  }
}

// Export singleton instance
export const maintenanceService = MaintenanceService.getInstance();