// URL utilities for handling Stash server paths
// Converts between relative paths (stored in DB) and full URLs (used at runtime)

/**
 * Check if a path is already relative (doesn't start with http/https)
 */
export function isRelativePath(path: string | null | undefined): boolean {
  if (!path) return true;
  return !path.match(/^https?:\/\//i);
}

/**
 * Extract relative path from a full URL
 * Examples:
 * "http://192.168.1.17:6969/scene/123/screenshot" -> "/scene/123/screenshot"
 * "/scene/123/screenshot" -> "/scene/123/screenshot" (already relative)
 */
export function extractRelativePath(fullUrl: string | null | undefined): string {
  if (!fullUrl) return "";
  
  // If already relative, return as-is
  if (isRelativePath(fullUrl)) {
    return fullUrl;
  }
  
  try {
    const url = new URL(fullUrl);
    return url.pathname + url.search;
  } catch {
    // If URL parsing fails, try to extract everything after the domain
    const match = fullUrl.match(/^https?:\/\/[^\/]+(\/.*)/i);
    return match ? match[1] : fullUrl;
  }
}

/**
 * Construct full Stash URL from relative path
 * @param relativePath - Path like "/scene/123/screenshot" or "/performer/456/image"  
 * @param stashServer - Base server URL like "http://192.168.1.17:6969"
 * @param apiKey - Optional API key to append as query parameter
 */
export function makeStashUrl(
  relativePath: string | null | undefined,
  stashServer: string,
  apiKey?: string
): string {
  if (!relativePath || !stashServer) return "";
  
  // If the path is already a full URL, return it as-is (or with API key if needed)
  if (!isRelativePath(relativePath)) {
    if (apiKey && !relativePath.includes("api_key=")) {
      const separator = relativePath.includes("?") ? "&" : "?";
      return `${relativePath}${separator}api_key=${encodeURIComponent(apiKey)}`;
    }
    return relativePath;
  }
  
  // Ensure stashServer doesn't have trailing slash
  const baseServer = stashServer.replace(/\/+$/, "");
  
  // Ensure relativePath starts with slash
  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  
  // Construct base URL
  let fullUrl = `${baseServer}${path}`;
  
  // Add API key if provided
  if (apiKey) {
    const separator = path.includes("?") ? "&" : "?";
    fullUrl += `${separator}api_key=${encodeURIComponent(apiKey)}`;
  }
  
  return fullUrl;
}

/**
 * Legacy function for compatibility - joins URL parts with proper slash handling
 * @deprecated Use makeStashUrl instead for new code
 */
export function joinUrl(base: string, suffix: string): string {
  const b = base.replace(/\/+$/, "");
  const s = suffix.replace(/^\/+/, "");
  return `${b}/${s}`;
}

/**
 * Legacy function for compatibility - adds API key to existing URL
 * @deprecated Use makeStashUrl instead for new code  
 */
export function withApiKey(url: string, apiKey: string): string {
  if (!url || !apiKey) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}api_key=${encodeURIComponent(apiKey)}`;
}