// src/app/api/backup/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  createBackup,
  listBackups,
  deleteBackup,
  restoreFromBackup,
  getBackupStatus,
  cleanupOldBackups,
  updateBackupSchedule,
} from '@/lib/backupService';

export async function GET() {
  try {
    const [backups, status] = await Promise.all([
      listBackups(),
      getBackupStatus(),
    ]);

    return NextResponse.json({
      backups: backups.map(backup => ({
        filename: backup.filename,
        size: backup.size,
        created: backup.created.toISOString(),
        sizeFormatted: formatFileSize(backup.size),
      })),
      status: {
        ...status,
        lastBackup: status.lastBackup?.toISOString(),
        nextBackup: status.nextBackup?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to get backup info:', error);
    return NextResponse.json(
      { error: 'Failed to get backup information' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔧 API: Backup POST request received');
    const body = await request.json();
    console.log('🔧 API: Request body:', body);
    const { action, filename } = body;

    switch (action) {
      case 'create': {
        console.log('🔧 API: Creating backup...');
        const backupFilename = await createBackup();
        console.log('✅ API: Backup created, running cleanup...');
        await cleanupOldBackups();
        console.log('✅ API: Cleanup completed');
        return NextResponse.json({
          success: true,
          filename: backupFilename,
          message: 'Backup created successfully',
        });
      }

      case 'delete': {
        if (!filename) {
          return NextResponse.json(
            { error: 'Filename is required for delete action' },
            { status: 400 }
          );
        }
        
        const deleted = deleteBackup(filename);
        if (!deleted) {
          return NextResponse.json(
            { error: 'Backup file not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          message: `Backup ${filename} deleted successfully`,
        });
      }

      case 'restore': {
        if (!filename) {
          return NextResponse.json(
            { error: 'Filename is required for restore action' },
            { status: 400 }
          );
        }

        await restoreFromBackup(filename);
        return NextResponse.json({
          success: true,
          message: `Database restored from backup ${filename}`,
        });
      }

      case 'cleanup': {
        const deletedCount = await cleanupOldBackups();
        return NextResponse.json({
          success: true,
          message: `Cleaned up ${deletedCount} old backup(s)`,
          deletedCount,
        });
      }

      case 'update-schedule': {
        await updateBackupSchedule();
        return NextResponse.json({
          success: true,
          message: 'Backup schedule updated',
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: create, delete, restore, cleanup, or update-schedule' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('❌ API: Backup API error:', error);
    console.error('❌ API: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Internal server error',
        success: false 
      },
      { status: 500 }
    );
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}