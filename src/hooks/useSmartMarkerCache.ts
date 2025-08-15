// Custom hook for smart marker caching with change detection
// Uses two-query approach: lightweight count check + full data fetch when needed

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useLazyQuery } from '@apollo/client';
import {
  getCachedMarkers,
  setCachedMarkers,
  clearCachedMarkers,
  getCacheKey,
  CacheResult
} from '../lib/markerCache';

interface UseSmartMarkerCacheProps {
  actorId: string;
  tagIds: string[];
  pageNumber?: number;  // For paginated queries
  perPage?: number;     // For paginated queries
  countQuery?: any;     // GraphQL query for count (legacy)
  dataQuery: any;       // GraphQL query for full data
  enabled?: boolean;    // Whether to run queries
}

interface UseSmartMarkerCacheResult {
  data: any[];
  ratings: Record<string, number>;
  loading: boolean;
  error: any;
  isFromCache: boolean;
  cacheAge?: number;    // Age in minutes
  refetch: () => void;
  clearCache: () => void;
  updateCachedRatings: (newRatings: Record<string, number>) => void;
}

export function useSmartMarkerCache({
  actorId,
  tagIds,
  pageNumber,
  perPage,
  dataQuery,
  enabled = true
}: UseSmartMarkerCacheProps): UseSmartMarkerCacheResult {
  
  // State for managing cache results and loading
  const [cachedResult, setCachedResult] = useState<CacheResult | null>(null);
  const [cacheAge, setCacheAge] = useState<number | undefined>(undefined);
  const [forceRefresh, setForceRefresh] = useState(false);
  
  // Variables for GraphQL queries - stringify for stable dependency
  const tagIdsKey = useMemo(() => JSON.stringify(tagIds), [tagIds]);
  const queryVariables = useMemo(() => {
    const baseVars = { actorId };
    
    // Add different variables based on query type
    if (pageNumber !== undefined && perPage !== undefined) {
      // Paginated query
      return { ...baseVars, pageNumber, perPage };
    } else {
      // Filtered query
      return { ...baseVars, tagID: tagIds };
    }
  }, [actorId, tagIdsKey, pageNumber, perPage]);

  // Single query approach - check cache first, then conditionally fetch
  const [
    fetchData, 
    { 
      data: queryData, 
      loading: queryLoading, 
      error: queryError 
    }
  ] = useLazyQuery(dataQuery, {
    variables: queryVariables,
    fetchPolicy: 'no-cache', // Always fetch fresh when we decide to run this
    errorPolicy: 'all'
  });

  // Cache decision logic - check cache and conditionally fetch
  useEffect(() => {
    if (!enabled) {
      return;
    }
    
    // Try to get cached data first
    const cacheResult = getCachedMarkers(actorId, tagIds, undefined, pageNumber, perPage);
    setCachedResult(cacheResult);

    // Calculate cache age if data is from cache
    if (cacheResult.isFromCache && cacheResult.data) {
      try {
        const cacheKey = getCacheKey(actorId, tagIds, pageNumber, perPage);
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const cacheData = JSON.parse(cached);
          const ageMinutes = (Date.now() - cacheData.timestamp) / (1000 * 60);
          setCacheAge(Math.round(ageMinutes));
        }
      } catch (error) {
        console.warn('Failed to calculate cache age:', error);
      }
    } else {
      setCacheAge(undefined);
    }

    // Decide whether to fetch data
    const shouldFetch = forceRefresh || 
                       !cacheResult.data || 
                       cacheResult.shouldRefresh;

    if (shouldFetch) {
      console.log(`📡 Fetching marker data for actor ${actorId} (page ${pageNumber || 'all'})`);
      fetchData();
    }
    
    // Reset force refresh flag
    if (forceRefresh) {
      setForceRefresh(false);
    }
  }, [
    enabled, 
    actorId, 
    tagIdsKey, 
    pageNumber,
    perPage,
    forceRefresh, 
    fetchData
  ]);

  // Cache storage when data is received
  useEffect(() => {
    if (queryData?.findSceneMarkers?.scene_markers && queryData?.findSceneMarkers?.count !== undefined) {
      const markers = queryData.findSceneMarkers.scene_markers;
      const count = queryData.findSceneMarkers.count;
      
      // Store in cache with empty ratings initially
      // Ratings will be updated via updateCachedRatings function
      setCachedMarkers(actorId, tagIds, count, markers, {}, pageNumber, perPage);
      
      // Update cached result state
      setCachedResult({
        data: markers,
        ratings: {},
        isFromCache: false,
        shouldRefresh: false
      });
    }
  }, [queryData, actorId, tagIdsKey, pageNumber, perPage]);

  // Function to update cache with fresh ratings
  const updateCachedRatings = useCallback((newRatings: Record<string, number>) => {
    if (cachedResult?.data) {
      // Update the cache with new ratings
      setCachedMarkers(actorId, tagIds, cachedResult.data.length, cachedResult.data, newRatings, pageNumber, perPage);
      
      // Update state
      setCachedResult(prev => prev ? {
        ...prev,
        ratings: newRatings
      } : null);
    }
  }, [actorId, tagIds, cachedResult?.data, pageNumber, perPage]);

  // Manual refresh function
  const refetch = useCallback(() => {
    setForceRefresh(true);
  }, []);

  // Manual cache clear function  
  const clearCache = useCallback(() => {
    clearCachedMarkers(actorId, tagIds, pageNumber, perPage);
    setCachedResult(null);
    setCacheAge(undefined);
    setForceRefresh(true);
  }, [actorId, tagIds, pageNumber, perPage]);

  // Return hook result with memoization to prevent unnecessary re-renders
  return useMemo(() => ({
    data: cachedResult?.data || [],
    ratings: cachedResult?.ratings || {},
    loading: queryLoading,
    error: queryError,
    isFromCache: cachedResult?.isFromCache || false,
    cacheAge,
    refetch,
    clearCache,
    updateCachedRatings
  }), [
    cachedResult?.data,
    cachedResult?.ratings,
    cachedResult?.isFromCache,
    queryLoading,
    queryError,
    cacheAge,
    refetch,
    clearCache,
    updateCachedRatings
  ]);
}