'use client';

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardActions,
  FormControl,
  FormLabel,
  Grid,
  IconButton,
  Input,
  LinearProgress,
  Sheet,
  Stack,
  Textarea,
  Tooltip,
  Typography,
} from "@mui/joy";
import { ArrowUp, ArrowDown, Trash2, Clock } from "lucide-react";
import { formatLength } from "@/lib/formatLength";
import PlaylistImageUpload from "@/components/PlaylistImageUpload";
import Image from "next/image";
import { useSettings } from "@/app/context/SettingsContext";
import { makeStashUrl } from "@/lib/urlUtils";

export default function EditManualPlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const settings = useSettings();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);

  // Fetch playlist details and items on mount
  useEffect(() => {
    async function fetchPlaylist() {
      setLoading(true);
      const res = await fetch(`/api/playlists/${id}`);
      if (res.ok) {
        const playlist = await res.json();
        setName(playlist.name || "");
        setDescription(playlist.description || "");
        setImage(playlist.image || null);
      }
      setLoading(false);
    }
    async function fetchItems() {
      const res = await fetch(`/api/playlists/${id}/items`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    }
    fetchPlaylist();
    fetchItems();
  }, [id]);

  // Save playlist name/description and item order
  async function handleSave() {
    setLoading(true);
    try {
      // Save name and description
      const res = await fetch(`/api/playlists/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });

      // Save item order
      const orderedItems = items.map((item, idx) => ({
        id: item.id,
        itemOrder: idx,
      }));
      const orderRes = await fetch(`/api/playlists/${id}/items/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedItems }),
      });

      if (res.ok && orderRes.ok) {
        router.push("/playlists");
      } else {
        throw new Error("Failed to save changes");
      }
    } catch (error) {
      console.error("Save failed:", error);
      // You could add a toast notification here instead of alert
      alert("Failed to save changes.");
    } finally {
      setLoading(false);
    }
  }

  // Move item up/down
  function moveItem(index: number, direction: "up" | "down") {
    const newItems = [...items];
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === items.length - 1)
    ) {
      return;
    }
    const swapWith = direction === "up" ? index - 1 : index + 1;
    [newItems[index], newItems[swapWith]] = [newItems[swapWith], newItems[index]];
    setItems(newItems);
  }

  // Remove item from playlist
  async function removeItem(itemId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/playlists/${id}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      
      if (res.ok) {
        setItems(items.filter(item => item.id !== itemId));
      } else {
        throw new Error("Failed to remove item");
      }
    } catch (error) {
      console.error("Remove failed:", error);
      alert("Failed to remove item.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet
      variant="outlined"
      sx={{
        mx: 'auto',
        my: 4,
        p: { xs: 2, sm: 3, md: 4 },
        borderRadius: 'lg',
        bgcolor: 'background.body',
      }}
    >
      <Box mb={2}>
        <Typography level="h3">Edit Manual Playlist</Typography>
        <Typography level="body-sm" color="neutral">
          Manage playlist details and reorder items.
        </Typography>
      </Box>

      {loading && <LinearProgress thickness={2} sx={{ mb: 2 }} />}

      <Grid container spacing={3}>
        {/* Left Column: Details */}
        <Grid xs={12} lg={5}>
          <Card variant="outlined" sx={{ height: 'fit-content' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography level="title-lg" mb={2}>Details</Typography>
              <Stack direction="row" spacing={3} sx={{ alignItems: 'stretch' }}>
                {/* Left side - Form fields */}
                <Stack spacing={2.5} sx={{ flex: 1, display: 'flex' }}>
                  <FormControl>
                    <FormLabel>Name</FormLabel>
                    <Input
                      placeholder="Playlist name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={loading}
                      size="lg"
                    />
                  </FormControl>
                  <FormControl sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <FormLabel>Description</FormLabel>
                    <Textarea
                      placeholder="Playlist description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={loading}
                      size="lg"
                      sx={{ 
                        resize: 'vertical', 
                        flex: 1,
                        minHeight: 0
                      }}
                    />
                  </FormControl>
                </Stack>
                
                {/* Right side - Cover Image */}
                <Box sx={{ width: 200, flexShrink: 0 }}>
                  <FormControl>
                    <FormLabel>Cover Image</FormLabel>
                    <PlaylistImageUpload
                      currentImage={image ? `/api/playlist-images/${image}` : null}
                      onImageUploaded={(imageUrl, filename) => setImage(filename)}
                      onImageDeleted={() => setImage(null)}
                      playlistId={id}
                      disabled={loading}
                    />
                  </FormControl>
                </Box>
              </Stack>
            </CardContent>

            <CardActions sx={{ justifyContent: 'flex-end', p: 3, pt: 2 }}>
              <Button
                size="lg"
                color="primary"
                onClick={handleSave}
                disabled={loading || !name}
                sx={{ minWidth: 120 }}
              >
                {loading ? 'Saving…' : 'Save Playlist'}
              </Button>
            </CardActions>
          </Card>
        </Grid>

        {/* Right Column: Playlist Items */}
        <Grid xs={12} lg={7}>
          <Card variant="outlined" sx={{ height: 'fit-content' }}>
            <CardContent sx={{ p: 0 }}>
              {/* Sticky Header */}
              <Box sx={{ 
                p: 3, 
                pb: 2,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.surface',
                position: 'sticky',
                top: 0,
                zIndex: 1
              }}>
                <Typography level="title-lg">Playlist Items ({items.length})</Typography>
                <Typography level="body-sm" color="neutral" sx={{ mt: 0.5 }}>
                  Drag to reorder, or use the arrow buttons to move items up and down.
                </Typography>
              </Box>

              {/* Items List */}
              <Box sx={{ p: 3, pt: 2 }}>
                {items.length === 0 ? (
                  <Box sx={{ 
                    textAlign: 'center', 
                    py: 8,
                    color: 'text.tertiary'
                  }}>
                    <Typography level="body-lg" sx={{ mb: 1 }}>
                      No items in this playlist
                    </Typography>
                    <Typography level="body-sm">
                      Add items from scenes to build your playlist.
                    </Typography>
                  </Box>
                ) : (
                  <Stack spacing={2}>
                    {items.map((item, idx) => (
                      <Card 
                        key={item.id}
                        variant="outlined"
                        sx={{
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          p: 2,
                          gap: 2,
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            bgcolor: 'background.level1',
                            transform: 'translateY(-1px)',
                            boxShadow: 'sm'
                          }
                        }}
                      >
                        {/* Thumbnail */}
                        <Box sx={{ 
                          position: 'relative',
                          width: 120, 
                          height: 68, // 16:9 aspect ratio (120*9/16 ≈ 68)
                          borderRadius: 'sm', 
                          overflow: 'hidden', 
                          bgcolor: 'neutral.softBg',
                          border: '1px solid',
                          borderColor: 'divider',
                          flexShrink: 0
                        }}>
                          {item.screenshot ? (
                            <Image
                              src={makeStashUrl(item.screenshot, String(settings["STASH_SERVER"] || ""), String(settings["STASH_API"] || ""))}
                              alt={item.title}
                              fill
                              style={{ objectFit: 'cover' }}
                            />
                          ) : (
                            <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Typography level="body-xs" color="neutral">No image</Typography>
                            </Box>
                          )}
                        </Box>

                        {/* Content */}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography 
                            level="title-md" 
                            sx={{ 
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              mb: 0.5
                            }}
                            title={item.title}
                          >
                            {item.title}
                          </Typography>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Clock size={14} />
                            <Typography level="body-sm" color="neutral">
                              {formatLength(item.endTime - item.startTime)}
                            </Typography>
                          </Stack>
                        </Box>

                        {/* Action Buttons */}
                        <Stack direction="row" spacing={1}>
                          <Stack direction="column" spacing={0.5}>
                            <Tooltip title="Move up">
                              <IconButton
                                size="sm"
                                variant="soft"
                                onClick={() => moveItem(idx, "up")}
                                disabled={idx === 0 || loading}
                              >
                                <ArrowUp size={16} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Move down">
                              <IconButton
                                size="sm"
                                variant="soft"
                                onClick={() => moveItem(idx, "down")}
                                disabled={idx === items.length - 1 || loading}
                              >
                                <ArrowDown size={16} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                          
                          <Tooltip title="Remove from playlist">
                            <IconButton
                              size="sm"
                              variant="soft"
                              color="danger"
                              onClick={() => removeItem(item.id)}
                              disabled={loading}
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Card>
                    ))}
                  </Stack>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Sheet>
  );
}