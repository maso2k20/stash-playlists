/**
 * VTT Processing Utility for Video.js VTT Thumbnails
 * 
 * Processes VTT files by:
 * 1. Fetching raw VTT content from Stash server
 * 2. Converting relative image paths to absolute URLs with API key
 * 3. Returning processed VTT as blob URL for video.js consumption
 */

/**
 * Processes VTT file for thumbnail display
 */
export async function processVttFile(
  vttPath: string, 
  stashServer: string, 
  stashAPI: string
): Promise<string | null> {
  if (!vttPath || !stashServer || !stashAPI) {
    console.warn('processVttFile: Missing required parameters');
    return null;
  }

  try {
    // Build full VTT URL with API key
    const vttUrl = joinUrl(stashServer, vttPath);
    const vttUrlWithKey = withApiKey(vttUrl, stashAPI);

    // Fetch raw VTT content
    const response = await fetch(vttUrlWithKey);
    if (!response.ok) {
      throw new Error(`Failed to fetch VTT file: ${response.status} ${response.statusText}`);
    }

    const vttContent = await response.text();
    
    // Process VTT content - convert relative image paths to absolute URLs with API key
    const processedVttContent = processVttContent(vttContent, stashServer, stashAPI);
    
    // Create blob URL for processed VTT
    const blob = new Blob([processedVttContent], { type: 'text/vtt' });
    return URL.createObjectURL(blob);

  } catch (error) {
    console.error('Error processing VTT file:', error);
    return null;
  }
}

/**
 * Processes VTT content by converting relative image paths to absolute URLs
 */
function processVttContent(vttContent: string, stashServer: string, stashAPI: string): string {
  // Split content into lines for processing
  const lines = vttContent.split('\n');
  
  const processedLines = lines.map(line => {
    // Skip WEBVTT header, comments, and timestamp lines
    if (line.startsWith('WEBVTT') || 
        line.startsWith('NOTE') || 
        line.includes('-->') || 
        line.trim() === '') {
      return line;
    }
    
    // Process thumbnail lines (contain image references)
    // Format: "filename.jpg#xywh=x,y,width,height"
    if (line.includes('.jpg') || line.includes('.jpeg') || line.includes('.png')) {
      // Extract filename and sprite coordinates
      const trimmedLine = line.trim();
      
      // Convert relative path to absolute URL
      // e.g., "e73cc78f01f84c3b_sprite.jpg#xywh=0,0,160,90"
      // becomes "http://192.168.1.17:9999/scene/e73cc78f01f84c3b_sprite.jpg#xywh=0,0,160,90?api_key=xxx"
      
      const [imagePath, spriteCoords] = trimmedLine.split('#');
      const fullImageUrl = joinUrl(stashServer, `/scene/${imagePath}`);
      const imageUrlWithKey = withApiKey(fullImageUrl, stashAPI);
      
      return spriteCoords ? `${imageUrlWithKey}#${spriteCoords}` : imageUrlWithKey;
    }
    
    return line;
  });
  
  return processedLines.join('\n');
}

/**
 * Utility function to join URL paths
 */
function joinUrl(base: string, path: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (!base) return path;
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Utility function to add API key to URL
 */
function withApiKey(url: string, apiKey: string): string {
  if (!url || !apiKey) return url;
  if (/[?&]api_key=/.test(url)) return url;
  return url.includes('?') ? `${url}&api_key=${apiKey}` : `${url}?api_key=${apiKey}`;
}

/**
 * Cleanup function to revoke blob URLs and prevent memory leaks
 */
export function cleanupVttBlob(blobUrl: string): void {
  if (blobUrl && blobUrl.startsWith('blob:')) {
    URL.revokeObjectURL(blobUrl);
  }
}