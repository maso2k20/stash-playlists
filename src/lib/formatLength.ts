export function formatLength(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins > 0 ? `${mins}min ` : ""}${secs}sec`;
}

/**
 * Formats seconds to MM:SS format
 * @param seconds - Number of seconds
 * @returns Formatted string like "2:30" or "0:45"
 */
export function formatSecondsToMMSS(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parses time input to seconds
 * Accepts formats: "2:30", "150", 150
 * @param input - Time input as string or number
 * @returns Number of seconds, or null if invalid
 */
export function parseTimeToSeconds(input: string | number): number | null {
  if (typeof input === 'number') {
    return Number.isFinite(input) && input >= 0 ? Math.floor(input) : null;
  }
  
  if (typeof input !== 'string') {
    return null;
  }
  
  const trimmed = input.trim();
  
  // Handle empty input
  if (trimmed === '') {
    return null;
  }
  
  // Check for MM:SS format
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0], 10);
      const secs = parseInt(parts[1], 10);
      
      if (Number.isInteger(mins) && Number.isInteger(secs) && 
          mins >= 0 && secs >= 0 && secs < 60) {
        return mins * 60 + secs;
      }
    }
    return null; // Invalid MM:SS format
  }
  
  // Handle raw seconds as string
  const seconds = parseInt(trimmed, 10);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : null;
}