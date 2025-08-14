// src/app/api/init/route.ts

import { NextResponse } from 'next/server';
import { initializeBackupService } from '@/lib/backupService';

let initialized = false;

export async function GET() {
  if (!initialized) {
    try {
      await initializeBackupService();
      initialized = true;
      console.log('Application initialized successfully');
      return NextResponse.json({ 
        success: true, 
        message: 'Application initialized successfully' 
      });
    } catch (error) {
      console.error('Failed to initialize application:', error);
      return NextResponse.json(
        { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        },
        { status: 500 }
      );
    }
  }
  
  return NextResponse.json({ 
    success: true, 
    message: 'Application already initialized' 
  });
}