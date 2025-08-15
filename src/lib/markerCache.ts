// Marker caching utilities for performance optimization
// Implements smart caching with change detection via count comparison

export interface MarkerCacheData {
  actorId: string;
  tagFilter: string;  // JSON stringified sorted tagID array
  count: number;
  data: any[];        // Full marker data from GraphQL
  ratings: Record<string, number>;  // Cached ratings
  timestamp: number;  // When cache was created
}

export interface CacheResult {
  data: any[] | null;
  ratings: Record<string, number>;
  isFromCache: boolean;
  shouldRefresh: boolean;
}

// Default cache timeout: 15 minutes
const CACHE_TIMEOUT_MS = 15 * 60 * 1000;

// Generate consistent cache key
export function getCacheKey(actorId: string, tagIds: string[], pageNumber?: number, perPage?: number): string {
  // Sort tag IDs for consistent cache keys regardless of order
  const sortedTagIds = [...tagIds].sort();
  const tagFilter = JSON.stringify(sortedTagIds);
  
  // Include pagination in cache key if provided
  const paginationKey = (pageNumber !== undefined && perPage !== undefined) 
    ? `-p${pageNumber}-${perPage}` 
    : '';
  
  return `marker-cache-${actorId}-${tagFilter}${paginationKey}`;
}

// Check if cache is expired
export function isCacheExpired(timestamp: number, timeoutMs: number = CACHE_TIMEOUT_MS): boolean {
  return Date.now() - timestamp > timeoutMs;
}

// Get cached data if valid
export function getCachedMarkers(actorId: string, tagIds: string[], expectedCount?: number, pageNumber?: number, perPage?: number): CacheResult {
  try {
    const cacheKey = getCacheKey(actorId, tagIds, pageNumber, perPage);
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      console.log(`❌ No cache found for actor ${actorId}`);
      return { data: null, ratings: {}, isFromCache: false, shouldRefresh: true };
    }

    const cacheData: MarkerCacheData = JSON.parse(cached);
    
    // Check if cache is expired
    if (isCacheExpired(cacheData.timestamp)) {
      console.log(`⏰ Cache expired for actor ${actorId}, age: ${Math.round((Date.now() - cacheData.timestamp) / (1000 * 60))}min`);
      localStorage.removeItem(cacheKey); // Clean up expired cache
      return { data: null, ratings: {}, isFromCache: false, shouldRefresh: true };
    }

    // Check if count mismatch (if provided)
    if (expectedCount !== undefined && cacheData.count !== expectedCount) {
      console.log(`🔢 Count mismatch for actor ${actorId}: cached=${cacheData.count}, expected=${expectedCount}`);
      return { 
        data: cacheData.data, 
        ratings: cacheData.ratings, 
        isFromCache: true, 
        shouldRefresh: true 
      };
    }

    // Valid cache found
    console.log(`✅ Cache HIT for actor ${actorId}: ${cacheData.data.length} items, age: ${Math.round((Date.now() - cacheData.timestamp) / (1000 * 60))}min`);
    return { 
      data: cacheData.data, 
      ratings: cacheData.ratings, 
      isFromCache: true, 
      shouldRefresh: false 
    };

  } catch (error) {
    console.warn('Failed to read marker cache:', error);
    return { data: null, ratings: {}, isFromCache: false, shouldRefresh: true };
  }
}

// Store markers in cache
export function setCachedMarkers(
  actorId: string, 
  tagIds: string[], 
  count: number, 
  data: any[], 
  ratings: Record<string, number>,
  pageNumber?: number,
  perPage?: number
): void {
  try {
    const cacheKey = getCacheKey(actorId, tagIds, pageNumber, perPage);
    const sortedTagIds = [...tagIds].sort();
    
    const cacheData: MarkerCacheData = {
      actorId,
      tagFilter: JSON.stringify(sortedTagIds),
      count,
      data,
      ratings,
      timestamp: Date.now(),
    };

    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log(`💾 Cached ${data.length} markers for actor ${actorId} (count: ${count})`);
  } catch (error) {
    console.warn('Failed to save marker cache:', error);
    // Handle storage quota exceeded or other errors gracefully
  }
}

// Clear specific cache entry
export function clearCachedMarkers(actorId: string, tagIds: string[], pageNumber?: number, perPage?: number): void {
  try {
    const cacheKey = getCacheKey(actorId, tagIds, pageNumber, perPage);
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.warn('Failed to clear marker cache:', error);
  }
}

// Clear all marker caches (useful for debugging or storage management)
export function clearAllMarkerCaches(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('marker-cache-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.warn('Failed to clear all marker caches:', error);
  }
}

// Get cache statistics (useful for debugging)
export function getCacheStats(): { totalCaches: number; totalSize: number } {
  let totalCaches = 0;
  let totalSize = 0;
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('marker-cache-')) {
        totalCaches++;
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += new Blob([value]).size;
        }
      }
    }
  } catch (error) {
    console.warn('Failed to calculate cache stats:', error);
  }
  
  return { totalCaches, totalSize };
}