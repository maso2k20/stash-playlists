// src/lib/ffmpegUtils.ts

export interface MarkerClipData {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  streamUrl: string;
}

export interface FFmpegOptions {
  useNvenc?: boolean;
  nvencQuality?: number; // CQ value: 1-51, lower = better quality, 18-28 typical
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
export function generateSingleCommand(marker: MarkerClipData, options: FFmpegOptions = {}): string {
  const outputFilename = generateOutputFilename(marker);
  const duration = marker.endTime - marker.startTime;

  if (options.useNvenc) {
    // NVENC: Use CUDA hardware acceleration for decoding, NVENC for encoding
    // -ss before -i enables fast seeking (seeks in input before decoding)
    // -t specifies duration (required when -ss is before -i)
    // -cq sets constant quality (lower = better, 18-28 typical)
    const qualityArgs = options.nvencQuality ? `-cq ${options.nvencQuality} -preset p4` : "";
    return `ffmpeg -y -hwaccel cuda -ss ${marker.startTime} -i "${marker.streamUrl}" -t ${duration} -c:v h264_nvenc ${qualityArgs} -c:a copy "${outputFilename}"`.replace(/  +/g, " ");
  }

  // Default: Use -c copy for no re-encoding (fastest)
  // -ss before -i for fast seeking, -t for duration
  return `ffmpeg -y -ss ${marker.startTime} -i "${marker.streamUrl}" -t ${duration} -c copy "${outputFilename}"`;
}

/**
 * Generate a batch shell script for extracting multiple clips
 */
export function generateBatchScript(markers: MarkerClipData[], options: FFmpegOptions = {}): string {
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
    options.useNvenc
      ? `# Encoding: NVIDIA NVENC (h264_nvenc)${options.nvencQuality ? ` - CQ ${options.nvencQuality}` : ""}`
      : "# Encoding: Stream copy (no re-encoding)",
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

    // -ss before -i enables fast seeking, -t for duration
    if (options.useNvenc) {
      const qualityArgs = options.nvencQuality ? `-cq ${options.nvencQuality} -preset p4` : "";
      lines.push(`ffmpeg -y -hwaccel cuda -ss ${marker.startTime} -i "${marker.streamUrl}" \\`);
      lines.push(`  -t ${duration} -c:v h264_nvenc ${qualityArgs} -c:a copy \\`.replace(/  +/g, " "));
    } else {
      lines.push(`ffmpeg -y -ss ${marker.startTime} -i "${marker.streamUrl}" \\`);
      lines.push(`  -t ${duration} -c copy \\`);
    }
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
