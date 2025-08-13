"use client";

import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Button,
  IconButton,
  Stack,
  Typography,
  LinearProgress,
  Alert,
} from '@mui/joy';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

interface PlaylistImageUploadProps {
  currentImage?: string | null;
  onImageUploaded?: (imageUrl: string, filename: string) => void;
  onImageDeleted?: () => void;
  playlistId?: string | null;
  disabled?: boolean;
}

export default function PlaylistImageUpload({
  currentImage,
  onImageUploaded,
  onImageDeleted,
  playlistId,
  disabled = false
}: PlaylistImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!playlistId) {
      setError('No playlist ID provided');
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Only JPEG, PNG, and WebP are allowed.');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Maximum size is 5MB.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`/api/playlists/${playlistId}/image`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      onImageUploaded?.(result.imageUrl, result.filename);
    } catch (err: any) {
      setError(err.message || 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  }, [playlistId, onImageUploaded]);

  const handleDeleteImage = useCallback(async () => {
    if (!playlistId || !currentImage) return;

    setUploading(true);
    setError(null);

    try {
      const response = await fetch(`/api/playlists/${playlistId}/image`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Delete failed');
      }

      onImageDeleted?.();
    } catch (err: any) {
      setError(err.message || 'Failed to delete image');
    } finally {
      setUploading(false);
    }
  }, [playlistId, currentImage, onImageDeleted]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <Box>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
      />

      {error && (
        <Alert color="danger" variant="soft" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {uploading && (
        <LinearProgress thickness={2} sx={{ mb: 2 }} />
      )}

      <Stack spacing={2}>
        {currentImage ? (
          // Show current image with delete option
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography level="body-sm" color="neutral">
                Current Image
              </Typography>
              <IconButton
                size="sm"
                color="danger"
                variant="soft"
                onClick={handleDeleteImage}
                disabled={uploading || disabled}
              >
                <X size={16} />
              </IconButton>
            </Stack>
            <Box
              sx={{
                width: '100%',
                maxWidth: 200,
                aspectRatio: '9/16',
                borderRadius: 'md',
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'neutral.softBg',
              }}
            >
              <img
                src={currentImage}
                alt="Playlist"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </Box>
          </Box>
        ) : (
          // Show upload area
          <Box
            sx={{
              border: '2px dashed',
              borderColor: dragOver ? 'primary.500' : 'neutral.300',
              borderRadius: 'md',
              p: 3,
              textAlign: 'center',
              cursor: disabled || uploading ? 'not-allowed' : 'pointer',
              bgcolor: dragOver ? 'primary.softBg' : 'background.surface',
              transition: 'all 0.2s ease',
              '&:hover': !disabled && !uploading ? {
                borderColor: 'primary.400',
                bgcolor: 'primary.softBg',
              } : {},
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={disabled || uploading ? undefined : openFileDialog}
          >
            <Stack spacing={2} alignItems="center">
              <ImageIcon size={32} color="var(--joy-palette-neutral-500)" />
              <Stack spacing={0.5} alignItems="center">
                <Typography level="body-md">
                  {dragOver ? 'Drop image here' : 'Add playlist image'}
                </Typography>
                <Typography level="body-sm" color="neutral">
                  Drag & drop or click to select (9:16 portrait)
                </Typography>
                <Typography level="body-xs" color="neutral">
                  JPEG, PNG, or WebP • Max 5MB
                </Typography>
              </Stack>
            </Stack>
          </Box>
        )}

        {!currentImage && (
          <Button
            startDecorator={<Upload size={16} />}
            variant="outlined"
            onClick={openFileDialog}
            disabled={uploading || disabled}
            sx={{ alignSelf: 'flex-start' }}
          >
            {uploading ? 'Uploading...' : 'Choose Image'}
          </Button>
        )}
      </Stack>
    </Box>
  );
}