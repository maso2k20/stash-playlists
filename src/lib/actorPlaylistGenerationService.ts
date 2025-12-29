// src/lib/actorPlaylistGenerationService.ts
import prisma from "@/lib/prisma";
import { buildItemsForPlaylist } from "@/lib/smartPlaylistServer";
import * as cron from 'node-cron';

type GenerationResult = {
  success: boolean;
  message: string;
  data: {
    actorsProcessed: number;
    templatesProcessed: number;
    playlistsCreated: number;
    playlistsSkipped: number;
    errors: string[];
    duration: number;
  };
};

export class ActorPlaylistGenerationService {
  private static instance: ActorPlaylistGenerationService;
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  private constructor() {}

  static getInstance(): ActorPlaylistGenerationService {
    if (!ActorPlaylistGenerationService.instance) {
      ActorPlaylistGenerationService.instance = new ActorPlaylistGenerationService();
    }
    return ActorPlaylistGenerationService.instance;
  }

  async getScheduleStatus() {
    try {
      const settings = await prisma.settings.findMany({
        where: {
          key: {
            in: ['ACTOR_PLAYLIST_GENERATION_ENABLED', 'ACTOR_PLAYLIST_GENERATION_HOUR']
          }
        }
      });

      const settingsMap = Object.fromEntries(
        settings.map(s => [s.key, s.value])
      );

      const enabled = settingsMap.ACTOR_PLAYLIST_GENERATION_ENABLED === 'true';
      const hour = parseInt(settingsMap.ACTOR_PLAYLIST_GENERATION_HOUR || '4');

      return {
        enabled,
        hour,
        isRunning: this.isRunning,
        nextRun: enabled ? this.getNextRunTime(hour) : null,
        cronActive: this.cronJob ? true : false
      };
    } catch (error) {
      console.error('❌ Failed to get actor generation schedule status:', error);
      return {
        enabled: false,
        hour: 4,
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
      console.log('🎭 Starting actor playlist generation scheduler...');

      const status = await this.getScheduleStatus();

      if (!status.enabled) {
        console.log('🎭 Actor playlist generation scheduler is disabled');
        this.stopScheduler();
        return;
      }

      // Stop existing cron job if running
      this.stopScheduler();

      // Schedule generation to run daily at the configured hour
      const cronExpression = `0 ${status.hour} * * *`; // minute hour day month weekday

      console.log(`🎭 Scheduling actor playlist generation for ${status.hour}:00 UTC daily (${cronExpression})`);

      this.cronJob = cron.schedule(cronExpression, async () => {
        console.log('🎭 Running scheduled actor playlist generation...');
        try {
          const result = await this.runGeneration('scheduled');
          await this.logGenerationResult('scheduled', result);
        } catch (error) {
          console.error('❌ Scheduled actor playlist generation failed:', error);
          await this.logGenerationResult('scheduled', {
            success: false,
            message: `Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            data: {
              actorsProcessed: 0,
              templatesProcessed: 0,
              playlistsCreated: 0,
              playlistsSkipped: 0,
              errors: [error instanceof Error ? error.message : 'Unknown error'],
              duration: 0
            }
          });
        }
      }, {
        timezone: "UTC"
      });

      console.log('✅ Actor playlist generation scheduler started successfully');
      return { success: true, nextRun: status.nextRun };
    } catch (error) {
      console.error('❌ Failed to start actor playlist generation scheduler:', error);
      throw error;
    }
  }

  stopScheduler() {
    if (this.cronJob) {
      console.log('🎭 Stopping actor playlist generation scheduler...');
      this.cronJob.stop();
      this.cronJob.destroy();
      this.cronJob = null;
      console.log('✅ Actor playlist generation scheduler stopped');
    }
  }

  async restartScheduler() {
    this.stopScheduler();
    await this.startScheduler();
  }

  async runGeneration(type: 'manual' | 'scheduled'): Promise<GenerationResult> {
    if (this.isRunning) {
      throw new Error('Actor playlist generation is already running');
    }

    const startTime = Date.now();
    this.isRunning = true;

    try {
      console.log('🎭 Starting actor playlist generation...');

      // Fetch all actors
      const actors = await prisma.actor.findMany({
        orderBy: { name: 'asc' }
      });

      console.log(`🎭 Found ${actors.length} actors`);

      if (actors.length === 0) {
        const duration = Date.now() - startTime;
        return {
          success: true,
          message: 'No actors found to generate playlists for',
          data: {
            actorsProcessed: 0,
            templatesProcessed: 0,
            playlistsCreated: 0,
            playlistsSkipped: 0,
            errors: [],
            duration
          }
        };
      }

      // Fetch all templates that are not excluded from auto-generation
      const templates = await prisma.playlistTemplate.findMany({
        where: { excludeFromAutoGeneration: false }
      });

      console.log(`🎭 Found ${templates.length} templates (excluding auto-generation disabled)`);

      if (templates.length === 0) {
        const duration = Date.now() - startTime;
        return {
          success: true,
          message: 'No templates available for auto-generation',
          data: {
            actorsProcessed: actors.length,
            templatesProcessed: 0,
            playlistsCreated: 0,
            playlistsSkipped: 0,
            errors: [],
            duration
          }
        };
      }

      // Fetch all existing playlist names for quick lookup
      const existingPlaylists = await prisma.playlist.findMany({
        select: { name: true }
      });
      const existingNames = new Set(existingPlaylists.map(p => p.name));

      const errors: string[] = [];
      let playlistsCreated = 0;
      let playlistsSkipped = 0;

      // Process each actor + template combination
      for (const actor of actors) {
        for (const template of templates) {
          const playlistName = `${actor.name} - ${template.name}`;

          // Skip if playlist already exists
          if (existingNames.has(playlistName)) {
            playlistsSkipped++;
            continue;
          }

          try {
            // Create the smart playlist with the actor and template tags
            const templateTagIds = template.tagIds as string[];
            const requiredTagIds = template.requiredTagIds !== undefined && template.requiredTagIds !== null
              ? (template.requiredTagIds as string[])
              : templateTagIds;
            const optionalTagIds = (template.optionalTagIds as string[] | null) ?? [];

            const playlist = await prisma.playlist.create({
              data: {
                name: playlistName,
                description: `Auto-generated from template "${template.name}"`,
                type: 'SMART',
                conditions: {
                  actorIds: [actor.id],
                  requiredTagIds,
                  optionalTagIds,
                  tagIds: templateTagIds,
                },
              },
            });

            // Add to our set so we don't try to create duplicates within this run
            existingNames.add(playlistName);

            // Refresh the playlist to populate items
            try {
              const items = await buildItemsForPlaylist(playlist.id);

              if (items.length > 0) {
                await prisma.$transaction(async (tx) => {
                  // Check which items already exist
                  const itemIds = items.map(item => item.id);
                  const existingItems = await tx.item.findMany({
                    where: { id: { in: itemIds } },
                    select: { id: true },
                  });
                  const existingIds = new Set(existingItems.map(i => i.id));

                  // Separate into new items and existing items
                  const newItems = items.filter(item => !existingIds.has(item.id));
                  const updateItems = items.filter(item => existingIds.has(item.id));

                  // Bulk create new items
                  if (newItems.length > 0) {
                    await tx.item.createMany({
                      data: newItems.map(item => ({
                        id: item.id,
                        title: item.title ?? 'Untitled',
                        startTime: item.startTime ?? 0,
                        endTime: item.endTime ?? 0,
                        screenshot: item.screenshot,
                        stream: item.stream,
                        preview: item.preview,
                        sceneId: item.sceneId,
                      })),
                    });
                  }

                  // Update existing items in parallel
                  if (updateItems.length > 0) {
                    await Promise.all(updateItems.map(item =>
                      tx.item.update({
                        where: { id: item.id },
                        data: {
                          title: item.title ?? 'Untitled',
                          startTime: item.startTime ?? 0,
                          endTime: item.endTime ?? 0,
                          screenshot: item.screenshot,
                          stream: item.stream,
                          preview: item.preview,
                          sceneId: item.sceneId,
                        },
                      })
                    ));
                  }

                  // Bulk create playlist item links
                  await tx.playlistItem.createMany({
                    data: items.map((item, i) => ({
                      playlistId: playlist.id,
                      itemId: item.id,
                      itemOrder: i,
                    })),
                  });
                });
              }
            } catch (refreshError) {
              // Playlist created but refresh failed - still count as created
              console.error(`⚠️ Failed to populate playlist ${playlistName}:`, refreshError);
            }

            playlistsCreated++;
            console.log(`✅ Created playlist: ${playlistName}`);

            // Add a small delay to avoid overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            const errorMessage = `Failed to create playlist "${playlistName}": ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(`❌ ${errorMessage}`);
            errors.push(errorMessage);
          }
        }
      }

      const duration = Date.now() - startTime;
      const result: GenerationResult = {
        success: errors.length === 0,
        message: `Generation completed: ${playlistsCreated} playlists created, ${playlistsSkipped} skipped (already exist)`,
        data: {
          actorsProcessed: actors.length,
          templatesProcessed: templates.length,
          playlistsCreated,
          playlistsSkipped,
          errors,
          duration
        }
      };

      console.log('✅ Actor playlist generation completed:', result.data);
      return result;
    } catch (error) {
      console.error('❌ Actor playlist generation failed:', error);
      const duration = Date.now() - startTime;

      return {
        success: false,
        message: `Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: {
          actorsProcessed: 0,
          templatesProcessed: 0,
          playlistsCreated: 0,
          playlistsSkipped: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          duration
        }
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async logGenerationResult(type: 'manual' | 'scheduled', result: GenerationResult) {
    try {
      await prisma.refreshLog.create({
        data: {
          refreshType: `actor-generation-${type}`,
          success: result.success,
          refreshedPlaylists: result.data.playlistsCreated,
          errors: result.data.errors.length > 0 ? result.data.errors : undefined,
          duration: result.data.duration
        }
      });
    } catch (error) {
      console.error('❌ Failed to log generation result:', error);
    }
  }
}

// Export singleton instance
export const actorPlaylistGenerationService = ActorPlaylistGenerationService.getInstance();
