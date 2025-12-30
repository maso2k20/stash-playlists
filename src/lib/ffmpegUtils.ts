// src/lib/ffmpegUtils.ts

export interface MarkerClipData {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  streamUrl: string;
}

/**
 * Sanitize a string for use as a filename
 * Removes/replaces characters that are invalid in filenames
 */
export function sanitizeFilename(title: string): string {
  if (!title) return "clip";

  // Replace invalid filename characters with underscores
  let sanitized = title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .trim();

  // Limit length to avoid filesystem issues
  if (sanitized.length > 100) {
    sanitized = sanitized.substring(0, 100);
  }

  return sanitized || "clip";
}

/**
 * Format seconds as a timestamp string (for filenames)
 */
function formatTimestamp(seconds: number): string {
  return Math.floor(seconds).toString();
}

/**
 * Generate output filename for a clip
 */
export function generateOutputFilename(marker: MarkerClipData): string {
  const sanitizedTitle = sanitizeFilename(marker.title);
  const start = formatTimestamp(marker.startTime);
  const end = formatTimestamp(marker.endTime);
  return `${sanitizedTitle}_${start}-${end}.mp4`;
}

/**
 * Generate a single FFmpeg command for extracting a clip
 */
export function generateSingleCommand(marker: MarkerClipData): string {
  const outputFilename = generateOutputFilename(marker);

  // Use -ss before -i for fast seeking, -to for end time, -c copy for no re-encoding
  return `ffmpeg -y -i "${marker.streamUrl}" -ss ${marker.startTime} -to ${marker.endTime} -c copy "${outputFilename}"`;
}

/**
 * Generate a batch shell script for extracting multiple clips
 */
export function generateBatchScript(markers: MarkerClipData[]): string {
  const timestamp = new Date().toISOString().replace("T", " at ").substring(0, 22);
  const totalDuration = markers.reduce((sum, m) => sum + (m.endTime - m.startTime), 0);
  const durationMinutes = Math.floor(totalDuration / 60);
  const durationSeconds = Math.floor(totalDuration % 60);

  const lines: string[] = [
    "#!/bin/bash",
    "",
    "# FFmpeg Clip Extraction Script",
    `# Generated: ${timestamp}`,
    `# Markers: ${markers.length} clip${markers.length === 1 ? "" : "s"}`,
    `# Total Duration: ${durationMinutes}m ${durationSeconds}s`,
    "",
    "# NOTE: This script contains your Stash API key in the URLs.",
    "# Keep this file secure and do not share it publicly.",
    "",
    "set -e  # Exit on error",
    "",
    `echo "Starting clip extraction (${markers.length} clips)..."`,
    `echo ""`,
    "",
  ];

  markers.forEach((marker, index) => {
    const num = index + 1;
    const total = markers.length;
    const duration = Math.floor(marker.endTime - marker.startTime);
    const outputFilename = generateOutputFilename(marker);

    lines.push(`# Clip ${num}: ${marker.title}`);
    lines.push(`echo "[${num}/${total}] Extracting: ${marker.title} (${duration}s)"`);
    lines.push(`ffmpeg -y -i "${marker.streamUrl}" \\`);
    lines.push(`  -ss ${marker.startTime} -to ${marker.endTime} -c copy \\`);
    lines.push(`  "${outputFilename}"`);
    lines.push(`echo ""`);
    lines.push("");
  });

  lines.push(`echo "Done! Extracted ${markers.length} clip${markers.length === 1 ? "" : "s"}."`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Trigger a file download in the browser
 */
export function downloadAsFile(content: string, filename: string, mimeType: string = "text/x-sh"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  }
}
