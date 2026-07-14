// src/lib/actorMarkerCountService.ts
import prisma from "@/lib/prisma";
import { stashGraph } from "@/lib/smartPlaylistServer";
import * as cron from "node-cron";

type MarkerCountResult = {
  success: boolean;
  message: string;
  data: {
    actorsProcessed: number;
    actorsUpdated: number;
    errors: string[];
    duration: number;
  };
};

// How many aliased findSceneMarkers calls to bundle into a single GraphQL
// request. Each is a cheap COUNT on Stash's side; 50 keeps the query readable.
const BATCH_SIZE = 50;

export class ActorMarkerCountService {
  private static instance: ActorMarkerCountService;
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  private constructor() {}

  static getInstance(): ActorMarkerCountService {
    if (!ActorMarkerCountService.instance) {
      ActorMarkerCountService.instance = new ActorMarkerCountService();
    }
    return ActorMarkerCountService.instance;
  }

  async getScheduleStatus() {
    try {
      const settings = await prisma.settings.findMany({
        where: { key: { in: ["ACTOR_MARKER_COUNT_ENABLED", "ACTOR_MARKER_COUNT_HOUR"] } },
      });
      const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

      const enabled = map.ACTOR_MARKER_COUNT_ENABLED === "true";
      const hour = parseInt(map.ACTOR_MARKER_COUNT_HOUR || "5");

      return {
        enabled,
        hour,
        isRunning: this.isRunning,
        nextRun: enabled ? this.getNextRunTime(hour) : null,
        cronActive: this.cronJob ? true : false,
      };
    } catch (error) {
      console.error("❌ Failed to get actor marker-count schedule status:", error);
      return { enabled: false, hour: 5, isRunning: false, nextRun: null, cronActive: false };
    }
  }

  private getNextRunTime(hour: number): Date {
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(hour, 0, 0, 0);
    if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);
    return nextRun;
  }

  async startScheduler() {
    try {
      console.log("🔢 Starting actor marker-count scheduler...");
      const status = await this.getScheduleStatus();

      if (!status.enabled) {
        console.log("🔢 Actor marker-count scheduler is disabled");
        this.stopScheduler();
        return;
      }

      this.stopScheduler();

      const cronExpression = `0 ${status.hour} * * *`; // minute hour day month weekday
      console.log(`🔢 Scheduling actor marker-count refresh for ${status.hour}:00 UTC daily (${cronExpression})`);

      this.cronJob = cron.schedule(
        cronExpression,
        async () => {
          console.log("🔢 Running scheduled actor marker-count refresh...");
          try {
            const result = await this.runRefresh("scheduled");
            await this.logResult("scheduled", result);
          } catch (error) {
            console.error("❌ Scheduled actor marker-count refresh failed:", error);
            await this.logResult("scheduled", {
              success: false,
              message: `Refresh failed: ${error instanceof Error ? error.message : "Unknown error"}`,
              data: { actorsProcessed: 0, actorsUpdated: 0, errors: [error instanceof Error ? error.message : "Unknown error"], duration: 0 },
            });
          }
        },
        { timezone: "UTC" }
      );

      console.log("✅ Actor marker-count scheduler started successfully");
      return { success: true, nextRun: status.nextRun };
    } catch (error) {
      console.error("❌ Failed to start actor marker-count scheduler:", error);
      throw error;
    }
  }

  stopScheduler() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob.destroy();
      this.cronJob = null;
      console.log("✅ Actor marker-count scheduler stopped");
    }
  }

  async restartScheduler() {
    this.stopScheduler();
    await this.startScheduler();
  }

  async runRefresh(type: "manual" | "scheduled"): Promise<MarkerCountResult> {
    if (this.isRunning) {
      throw new Error("Actor marker-count refresh is already running");
    }

    const startTime = Date.now();
    this.isRunning = true;

    try {
      const actors = await prisma.actor.findMany({ select: { id: true, name: true } });
      console.log(`🔢 Refreshing marker counts for ${actors.length} actors...`);

      if (actors.length === 0) {
        return {
          success: true,
          message: "No actors to refresh",
          data: { actorsProcessed: 0, actorsUpdated: 0, errors: [], duration: Date.now() - startTime },
        };
      }

      const errors: string[] = [];
      const counts: { id: string; count: number }[] = [];

      // Query Stash in batches of aliased findSceneMarkers COUNTs — one request
      // per batch rather than one per actor.
      for (let i = 0; i < actors.length; i += BATCH_SIZE) {
        const batch = actors.slice(i, i + BATCH_SIZE);
        const aliases = batch
          .map(
            (actor, idx) =>
              `a${idx}: findSceneMarkers(` +
              `filter: { per_page: 0 }, ` +
              `scene_marker_filter: { performers: { modifier: INCLUDES, value: [${JSON.stringify(actor.id)}] } }` +
              `) { count }`
          )
          .join("\n");
        const query = `query ActorMarkerCounts { ${aliases} }`;

        try {
          const data = await stashGraph<Record<string, { count: number } | null>>(query, {});
          batch.forEach((actor, idx) => {
            const count = data[`a${idx}`]?.count;
            if (typeof count === "number") {
              counts.push({ id: actor.id, count });
            } else {
              errors.push(`No count returned for ${actor.name} (${actor.id})`);
            }
          });
        } catch (error) {
          const msg = `Batch starting at ${i} failed: ${error instanceof Error ? error.message : "Unknown error"}`;
          console.error(`❌ ${msg}`);
          errors.push(msg);
        }
      }

      // Persist the counts. Use a single timestamp for the whole run.
      const updatedAt = new Date();
      await prisma.$transaction(
        counts.map((c) =>
          prisma.actor.update({
            where: { id: c.id },
            data: { markerCount: c.count, markerCountUpdatedAt: updatedAt },
          })
        )
      );

      const duration = Date.now() - startTime;
      const result: MarkerCountResult = {
        success: errors.length === 0,
        message: `Updated marker counts for ${counts.length} of ${actors.length} actors`,
        data: { actorsProcessed: actors.length, actorsUpdated: counts.length, errors, duration },
      };
      console.log("✅ Actor marker-count refresh completed:", result.data);
      return result;
    } catch (error) {
      console.error("❌ Actor marker-count refresh failed:", error);
      return {
        success: false,
        message: `Refresh failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        data: { actorsProcessed: 0, actorsUpdated: 0, errors: [error instanceof Error ? error.message : "Unknown error"], duration: Date.now() - startTime },
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async logResult(type: "manual" | "scheduled", result: MarkerCountResult) {
    try {
      await prisma.refreshLog.create({
        data: {
          refreshType: `actor-marker-count-${type}`,
          success: result.success,
          refreshedPlaylists: result.data.actorsUpdated, // generic count column
          errors: result.data.errors.length > 0 ? result.data.errors : undefined,
          duration: result.data.duration,
        },
      });
    } catch (error) {
      console.error("❌ Failed to log marker-count result:", error);
    }
  }
}

// Export singleton instance
export const actorMarkerCountService = ActorMarkerCountService.getInstance();
