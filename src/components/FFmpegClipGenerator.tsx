// src/components/FFmpegClipGenerator.tsx
"use client";

import React, { useState, useMemo } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Slider,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/joy";
import { Check, Clipboard, Download, Clock } from "lucide-react";
import {
  MarkerClipData,
  generateSingleCommand,
  generateBatchScript,
  downloadAsFile,
  copyToClipboard,
  generateOutputFilename,
} from "@/lib/ffmpegUtils";
import { makeStashUrl } from "@/lib/urlUtils";

interface MarkerData {
  id: string;
  title: string;
  seconds: number;
  end_seconds: number | null;
  stream: string;
  scene: { id: string };
}

interface FFmpegClipGeneratorProps {
  open: boolean;
  onClose: () => void;
  markers: MarkerData[];
  stashServer: string;
  stashApiKey: string;
}

export default function FFmpegClipGenerator({
  open,
  onClose,
  markers,
  stashServer,
  stashApiKey,
}: FFmpegClipGeneratorProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [useNvenc, setUseNvenc] = useState(false);
  const [nvencQuality, setNvencQuality] = useState<number>(23); // CQ 23 is a good default

  // Convert markers to clip data with full URLs
  // Use the scene's stream URL (not the marker's pre-cut stream) so we can apply timestamps
  const clipData: MarkerClipData[] = useMemo(() => {
    return markers.map((marker) => ({
      id: marker.id,
      title: marker.title,
      startTime: marker.seconds,
      endTime: marker.end_seconds ?? marker.seconds + 30, // Default 30s if no end time
      streamUrl: makeStashUrl(`/scene/${marker.scene.id}/stream`, stashServer, stashApiKey),
    }));
  }, [markers, stashServer, stashApiKey]);

  // Calculate total duration
  const totalDuration = useMemo(() => {
    const seconds = clipData.reduce((sum, clip) => sum + (clip.endTime - clip.startTime), 0);
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  }, [clipData]);

  const ffmpegOptions = useMemo(
    () => ({ useNvenc, nvencQuality: useNvenc ? nvencQuality : undefined }),
    [useNvenc, nvencQuality]
  );

  const handleCopySingle = async (clip: MarkerClipData) => {
    const command = generateSingleCommand(clip, ffmpegOptions);
    const success = await copyToClipboard(command);
    if (success) {
      setCopiedId(clip.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleCopyAll = async () => {
    const commands = clipData.map((clip) => generateSingleCommand(clip, ffmpegOptions)).join("\n\n");
    const success = await copyToClipboard(commands);
    if (success) {
      setSnackbarMessage(`Copied ${clipData.length} command${clipData.length === 1 ? "" : "s"} to clipboard`);
      setSnackbarOpen(true);
    }
  };

  const handleDownloadScript = () => {
    const script = generateBatchScript(clipData, ffmpegOptions);
    const timestamp = new Date().toISOString().substring(0, 10);
    const filename = `ffmpeg_clips_${timestamp}.sh`;
    downloadAsFile(script, filename);
    setSnackbarMessage(`Downloaded ${filename}`);
    setSnackbarOpen(true);
  };

  const formatDuration = (startTime: number, endTime: number) => {
    const duration = Math.floor(endTime - startTime);
    if (duration < 60) return `${duration}s`;
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <>
      <Modal open={open} onClose={onClose}>
        <ModalDialog
          variant="outlined"
          sx={{
            width: "min(900px, 90vw)",
            maxHeight: "80vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <ModalClose />

          {/* Header */}
          <Box sx={{ mb: 2 }}>
            <Typography level="h4">Generate FFmpeg Commands</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Chip size="sm" variant="soft" color="primary">
                {clipData.length} clip{clipData.length === 1 ? "" : "s"}
              </Chip>
              <Chip size="sm" variant="soft" color="neutral" startDecorator={<Clock size={14} />}>
                {totalDuration} total
              </Chip>
              <Divider orientation="vertical" sx={{ mx: 1, height: 20 }} />
              <Checkbox
                size="sm"
                label="Use Nvidia NVENC"
                checked={useNvenc}
                onChange={(e) => setUseNvenc(e.target.checked)}
              />
              {useNvenc && (
                <>
                  <Divider orientation="vertical" sx={{ mx: 1, height: 20 }} />
                  <Typography level="body-sm" sx={{ whiteSpace: "nowrap" }}>
                    Quality (CQ {nvencQuality}):
                  </Typography>
                  <Slider
                    size="sm"
                    value={nvencQuality}
                    onChange={(_, value) => setNvencQuality(value as number)}
                    min={18}
                    max={35}
                    step={1}
                    sx={{ width: 120 }}
                    marks={[
                      { value: 18, label: "High" },
                      { value: 35, label: "Low" },
                    ]}
                  />
                </>
              )}
            </Stack>
          </Box>

          <Divider />

          {/* Scrollable marker list */}
          <Box
            sx={{
              flex: 1,
              overflow: "auto",
              my: 2,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            {clipData.map((clip, index) => (
              <Sheet
                key={clip.id}
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: "md",
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <Chip size="sm" variant="soft" color="neutral">
                  {index + 1}
                </Chip>

                <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <Typography level="title-sm" noWrap title={clip.title}>
                    {clip.title}
                  </Typography>
                  <Typography level="body-xs" color="neutral" noWrap title={generateOutputFilename(clip)}>
                    {formatDuration(clip.startTime, clip.endTime)} • {generateOutputFilename(clip)}
                  </Typography>
                </Box>

                <Tooltip title={copiedId === clip.id ? "Copied!" : "Copy command"}>
                  <IconButton
                    size="sm"
                    variant="soft"
                    color={copiedId === clip.id ? "success" : "neutral"}
                    onClick={() => handleCopySingle(clip)}
                  >
                    {copiedId === clip.id ? <Check size={16} /> : <Clipboard size={16} />}
                  </IconButton>
                </Tooltip>
              </Sheet>
            ))}
          </Box>

          <Divider />

          {/* Footer actions */}
          <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: "flex-end" }}>
            <Button variant="soft" color="neutral" onClick={onClose}>
              Close
            </Button>
            {clipData.length === 1 ? (
              <Button
                variant="solid"
                color="primary"
                startDecorator={<Clipboard size={16} />}
                onClick={handleCopyAll}
              >
                Copy Command
              </Button>
            ) : (
              <Button
                variant="solid"
                color="primary"
                startDecorator={<Download size={16} />}
                onClick={handleDownloadScript}
              >
                Download Script (.sh)
              </Button>
            )}
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Success snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        color="success"
        variant="soft"
        startDecorator={<Check size={18} />}
      >
        {snackbarMessage}
      </Snackbar>
    </>
  );
}
