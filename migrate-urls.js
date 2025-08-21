#!/usr/bin/env node
// JavaScript version of URL migration script
// Converts existing full URLs in Actor.image_path and Item fields to relative paths

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// URL utility functions (JavaScript versions)
function isRelativePath(path) {
  if (!path) return true;
  return !path.match(/^https?:\/\//i);
}

function extractRelativePath(fullUrl) {
  if (!fullUrl) return "";
  
  if (isRelativePath(fullUrl)) {
    return fullUrl;
  }
  
  try {
    const url = new URL(fullUrl);
    return url.pathname + url.search;
  } catch {
    const match = fullUrl.match(/^https?:\/\/[^\/]+(\/.*)/i);
    return match ? match[1] : fullUrl;
  }
}

async function migrateActorUrls() {
  console.log('🔄 Migrating Actor image_path URLs...');
  
  const actors = await prisma.actor.findMany({
    select: { id: true, image_path: true }
  });
  
  let updated = 0;
  const errors = [];
  
  for (const actor of actors) {
    if (!actor.image_path || isRelativePath(actor.image_path)) {
      continue;
    }
    
    try {
      const relativePath = extractRelativePath(actor.image_path);
      
      if (relativePath && relativePath !== actor.image_path) {
        await prisma.actor.update({
          where: { id: actor.id },
          data: { image_path: relativePath }
        });
        
        console.log(`  ✅ Actor ${actor.id}: ${actor.image_path} → ${relativePath}`);
        updated++;
      }
    } catch (error) {
      const errorMsg = `Actor ${actor.id}: ${error.message}`;
      console.log(`  ❌ ${errorMsg}`);
      errors.push(errorMsg);
    }
  }
  
  return { processed: actors.length, updated, errors };
}

async function migrateItemUrls() {
  console.log('🔄 Migrating Item URLs (screenshot, stream, preview)...');
  
  const items = await prisma.item.findMany({
    select: { id: true, screenshot: true, stream: true, preview: true }
  });
  
  let updated = 0;
  const errors = [];
  
  for (const item of items) {
    let needsUpdate = false;
    const updates = {};
    
    // Process screenshot
    if (item.screenshot && !isRelativePath(item.screenshot)) {
      try {
        const relativePath = extractRelativePath(item.screenshot);
        if (relativePath && relativePath !== item.screenshot) {
          updates.screenshot = relativePath;
          needsUpdate = true;
        }
      } catch (error) {
        errors.push(`Item ${item.id} screenshot: ${error.message}`);
      }
    }
    
    // Process stream
    if (item.stream && !isRelativePath(item.stream)) {
      try {
        const relativePath = extractRelativePath(item.stream);
        if (relativePath && relativePath !== item.stream) {
          updates.stream = relativePath;
          needsUpdate = true;
        }
      } catch (error) {
        errors.push(`Item ${item.id} stream: ${error.message}`);
      }
    }
    
    // Process preview
    if (item.preview && !isRelativePath(item.preview)) {
      try {
        const relativePath = extractRelativePath(item.preview);
        if (relativePath && relativePath !== item.preview) {
          updates.preview = relativePath;
          needsUpdate = true;
        }
      } catch (error) {
        errors.push(`Item ${item.id} preview: ${error.message}`);
      }
    }
    
    if (needsUpdate) {
      try {
        await prisma.item.update({
          where: { id: item.id },
          data: updates
        });
        
        console.log(`  ✅ Item ${item.id}:`, updates);
        updated++;
      } catch (error) {
        const errorMsg = `Item ${item.id} update failed: ${error.message}`;
        console.log(`  ❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }
  }
  
  return { processed: items.length, updated, errors };
}

async function main() {
  console.log('🚀 Starting URL migration to relative paths...');
  console.log('');
  
  const stats = {
    actorsProcessed: 0,
    actorsUpdated: 0,
    itemsProcessed: 0,
    itemsUpdated: 0,
    errors: []
  };
  
  try {
    // Migrate Actors
    const actorResults = await migrateActorUrls();
    stats.actorsProcessed = actorResults.processed;
    stats.actorsUpdated = actorResults.updated;
    stats.errors.push(...actorResults.errors);
    
    console.log('');
    
    // Migrate Items
    const itemResults = await migrateItemUrls();
    stats.itemsProcessed = itemResults.processed;
    stats.itemsUpdated = itemResults.updated;
    stats.errors.push(...itemResults.errors);
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    stats.errors.push(`Migration failed: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
  
  // Print summary
  console.log('');
  console.log('📊 Migration Summary:');
  console.log(`  Actors: ${stats.actorsUpdated}/${stats.actorsProcessed} updated`);
  console.log(`  Items: ${stats.itemsUpdated}/${stats.itemsProcessed} updated`);
  
  if (stats.errors.length > 0) {
    console.log(`  Errors: ${stats.errors.length}`);
    console.log('');
    console.log('❌ Errors encountered:');
    stats.errors.forEach(error => console.log(`  - ${error}`));
    process.exit(1);
  } else {
    console.log('  ✅ Migration completed successfully!');
  }
}

// Run migration
main().catch(console.error);