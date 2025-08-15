// src/lib/backupService.ts

import * as cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Get database path from environment or use default development path
const getDatabasePath = () => {
  const dbUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
  if (dbUrl.startsWith('file:')) {
    return dbUrl.replace('file:', '').replace(/^\.\//, process.cwd() + '/');
  }
  return dbUrl;
};

// Set backup directory based on environment
const BACKUP_DIR = process.env.NODE_ENV === 'production' ? '/data/backups' : './backups';
const DB_PATH = getDatabasePath();

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  created: Date;
}

export interface BackupStatus {
  lastBackup?: Date;
  nextBackup?: Date;
  enabled: boolean;
  retentionDays: number;
  backupHour: number;
}

let cronJob: cron.ScheduledTask | null = null;

// Ensure backup directory exists
export function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// Create a backup file using SQLite's backup command
export async function createBackup(): Promise<string> {
  ensureBackupDir();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupFilename = `stash-playlists-${timestamp}.db`;
  const backupPath = path.join(BACKUP_DIR, backupFilename);
  
  // Use Prisma to execute VACUUM INTO command (avoids database locking issues)
  const prisma = new PrismaClient();
  
  try {
    // Create backup using VACUUM INTO (creates a clean, compacted copy)
    await prisma.$executeRaw`VACUUM INTO ${backupPath}`;
    
    console.log(`Backup created successfully: ${backupFilename}`);
    return backupFilename;
  } catch (error) {
    console.error('Backup failed:', error);
    throw new Error(`Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    await prisma.$disconnect();
  }
}

// List all available backup files
export function listBackups(): BackupInfo[] {
  ensureBackupDir();
  
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(file => file.startsWith('stash-playlists-') && file.endsWith('.db'))
    .map(file => {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      
      return {
        filename: file,
        path: filePath,
        size: stats.size,
        created: stats.birthtime,
      };
    })
    .sort((a, b) => b.created.getTime() - a.created.getTime());
  
  return files;
}

// Delete old backup files based on retention policy
export async function cleanupOldBackups(): Promise<number> {
  const prisma = new PrismaClient();
  
  try {
    const retentionSetting = await prisma.settings.findFirst({
      where: { key: 'BACKUP_RETENTION_DAYS' }
    });
    
    const retentionDays = parseInt(retentionSetting?.value ?? '7');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const backups = listBackups();
    const toDelete = backups.filter(backup => backup.created < cutoffDate);
    
    let deletedCount = 0;
    for (const backup of toDelete) {
      try {
        fs.unlinkSync(backup.path);
        console.log(`Deleted old backup: ${backup.filename}`);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete backup ${backup.filename}:`, error);
      }
    }
    
    return deletedCount;
  } finally {
    await prisma.$disconnect();
  }
}

// Delete a specific backup file
export function deleteBackup(filename: string): boolean {
  const backupPath = path.join(BACKUP_DIR, filename);
  
  if (!fs.existsSync(backupPath)) {
    return false;
  }
  
  try {
    fs.unlinkSync(backupPath);
    console.log(`Deleted backup: ${filename}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete backup ${filename}:`, error);
    return false;
  }
}

// Restore database from backup
export async function restoreFromBackup(filename: string): Promise<void> {
  const backupPath = path.join(BACKUP_DIR, filename);
  
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${filename}`);
  }
  
  // Create a backup of current database before restoring
  await createBackup();
  
  try {
    // Copy backup file over current database
    fs.copyFileSync(backupPath, DB_PATH);
    console.log(`Database restored from backup: ${filename}`);
  } catch (error) {
    console.error('Restore failed:', error);
    throw new Error(`Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Get backup status and settings
export async function getBackupStatus(): Promise<BackupStatus> {
  const prisma = new PrismaClient();
  
  try {
    const settings = await prisma.settings.findMany({
      where: {
        key: { in: ['BACKUP_ENABLED', 'BACKUP_RETENTION_DAYS', 'BACKUP_HOUR'] }
      }
    });
    
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
    
    const enabled = settingsMap.BACKUP_ENABLED === 'true';
    const retentionDays = parseInt(settingsMap.BACKUP_RETENTION_DAYS ?? '7');
    const backupHour = parseInt(settingsMap.BACKUP_HOUR ?? '2');
    
    const backups = listBackups();
    const lastBackup = backups.length > 0 ? backups[0].created : undefined;
    
    // Calculate next backup time
    let nextBackup: Date | undefined;
    if (enabled) {
      nextBackup = new Date();
      nextBackup.setHours(backupHour, 0, 0, 0);
      
      // If today's backup time has passed, schedule for tomorrow
      if (nextBackup <= new Date()) {
        nextBackup.setDate(nextBackup.getDate() + 1);
      }
    }
    
    return {
      lastBackup,
      nextBackup,
      enabled,
      retentionDays,
      backupHour,
    };
  } finally {
    await prisma.$disconnect();
  }
}

// Scheduled backup function
async function performScheduledBackup(): Promise<void> {
  console.log('Running scheduled backup...');
  
  try {
    await createBackup();
    await cleanupOldBackups();
    console.log('Scheduled backup completed successfully');
  } catch (error) {
    console.error('Scheduled backup failed:', error);
  }
}

// Initialize backup cron job
export async function initializeBackupService(): Promise<void> {
  console.log('Initializing backup service...');
  
  // Stop existing cron job if running
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
  
  const status = await getBackupStatus();
  
  if (status.enabled) {
    // Schedule backup to run daily at the configured hour
    const cronExpression = `0 ${status.backupHour} * * *`; // Daily at specified hour
    
    cronJob = cron.schedule(cronExpression, performScheduledBackup, {
      scheduled: true,
      timezone: 'UTC', // Use UTC to avoid timezone issues
    });
    
    console.log(`Backup service started - scheduled for ${status.backupHour}:00 UTC daily`);
  } else {
    console.log('Backup service disabled in settings');
  }
}

// Update backup schedule when settings change
export async function updateBackupSchedule(): Promise<void> {
  await initializeBackupService();
}

// Stop backup service
export function stopBackupService(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('Backup service stopped');
  }
}