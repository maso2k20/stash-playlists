// src/app/actors/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useQuery, gql } from "@apollo/client";
import { useParams } from "next/navigation";
import { useSettings } from "@/app/context/SettingsContext";
import { useStashTags } from "@/context/StashTagsContext";

import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const GET_MARKERS_FOR_ACTOR = gql`
  query findActorsSceneMarkers($actorId: ID!, $tagID: [ID!]!) {
    findSceneMarkers(
      scene_marker_filter: {
        performers: { modifier: INCLUDES, value: [$actorId] }
        tags: { modifier: INCLUDES, value: $tagID }
      }
    ) {
      scene_markers {
        id
        title
        seconds
        end_seconds
        screenshot
        stream
        scene {
          id
        }
      }
    }
  }
`;

export default function Page() {
  const { id: actorId } = useParams();
  const [selectedMarkers, setSelectedMarkers] = useState<string[]>([]);

  const [playlists, setPlaylists] = useState<{ id: string; name: string }[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [playlistsError, setPlaylistsError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [chosenPlaylistId, setChosenPlaylistId] = useState<string>("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [playlistPopoverOpen, setPlaylistPopoverOpen] = useState(false);

  const [tagFilter, setTagFilter] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  const settings = useSettings();
  const stashServer = settings["STASH_SERVER"];
  const stashAPI = settings["STASH_API"];

  const { stashTags, loading: tagsLoading, error: tagsError } = useStashTags();

  // Fetch playlists once
  useEffect(() => {
    fetch("/api/playlists")
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then(setPlaylists)
      .catch((err) => setPlaylistsError(err.message))
      .finally(() => setPlaylistsLoading(false));
  }, []);

  // Use stashTags for query variables
  const tagIDsForFilter = selectedTagId ? [selectedTagId] : stashTags.map((tag: any) => tag.id);

  const { data, loading, error } = useQuery(GET_MARKERS_FOR_ACTOR, {
    variables: { actorId, tagID: tagIDsForFilter },
    fetchPolicy: "cache-and-network",
  });

  useEffect(() => {
    console.log('selectedMarkers changed:', selectedMarkers);
  }, [selectedMarkers]);

  useEffect(() => {
    if (isDialogOpen) {
      console.log("Playlists loaded for dialog:", playlists);
    }
  }, [isDialogOpen, playlists]);

  if (loading || tagsLoading || playlistsLoading) return <p>Loading…</p>;
  if (error) return <p>Error loading markers: {error.message}</p>;
  if (tagsError) return <p>Error loading tags: {tagsError}</p>;
  if (playlistsError) return <p>Error loading playlists: {playlistsError}</p>;

  const scenes = data?.findSceneMarkers?.scene_markers ?? [];

  const toggleMarker = (markerId: string) => {
    setSelectedMarkers((prev) =>
      prev.includes(markerId)
        ? prev.filter((m) => m !== markerId)
        : [...prev, markerId]
    );
  };

  const confirmAdd = async () => {
    const items = selectedMarkers
      .map((mId) => {
        const marker = scenes.find((m: { id: string; }) => m.id === mId);
        if (!marker) return null;
        return {
          id: marker.id,
          title: marker.title,
          startTime: marker.seconds,
          endTime: marker.end_seconds,
          screenshot: marker.screenshot,
          stream: `${stashServer}/scene/${marker.scene.id}/stream?api_key=${stashAPI}`,
        };
      })
      .filter(Boolean);

    console.log("chosenPlaylistId:", chosenPlaylistId);
    console.log("items to send:", items);

    try {
      const res = await fetch(`/api/playlists/${chosenPlaylistId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      // Log the raw response and parsed result
      console.log("fetch response:", res);
      const result = await res.json();
      console.log("API result:", result);

      if (!res.ok) {
        console.error("Add-to-playlist failed:", result);
      } else {
        setSelectedMarkers([]);
        setChosenPlaylistId("");
        setIsDialogOpen(false);
      }
    } catch (err) {
      console.error("Network or code error:", err);
    }
  };

  const filteredTags = stashTags.filter(
    (tag: any) => tag.name.toLowerCase().includes(tagFilter.toLowerCase())
  );


  return (
    <div className="p-4 space-y-4">
      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Tag Filter */}
        <div className="w-full max-w-xs flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={popoverOpen}
                  className="w-full justify-between"
                >
                  {stashTags.find((tag: any) => tag.id === selectedTagId)?.name || "Choose tag"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput
                    placeholder="Search tags..."
                    value={tagFilter}
                    onValueChange={setTagFilter}
                  />
                  <CommandList>
                    <CommandEmpty>No tags found.</CommandEmpty>
                    <CommandGroup>
                      {filteredTags.map((tag: any) => (
                        <CommandItem
                          key={tag.id}
                          value={tag.name}
                          onSelect={() => {
                            setSelectedTagId(tag.id ?? null);
                            setPopoverOpen(false);
                          }}
                        >
                          {tag.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              className="ml-2"
              onClick={() => setSelectedTagId(null)}
              disabled={selectedTagId === null}
            >
              Reset
            </Button>

            {/* “Add to Playlist” button + dialog */}
            {selectedMarkers.length > 0 && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    Add {selectedMarkers.length} to Playlist
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Select Playlist</DialogTitle>
                  </DialogHeader>
                  <div className="py-4">
                    <Popover open={playlistPopoverOpen} onOpenChange={setPlaylistPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={playlistPopoverOpen}
                          className="w-full justify-between"
                        >
                          {chosenPlaylistId
                            ? playlists.find((pl) => pl.id === chosenPlaylistId)?.name
                            : "Choose playlist"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput placeholder="Search playlists..." />
                          <CommandList>
                            <CommandEmpty>No playlists found.</CommandEmpty>
                            <CommandGroup>
                              {playlists.map((pl) => (
                                <CommandItem
                                  key={pl.id}
                                  value={pl.id}
                                  onSelect={() => {
                                    setChosenPlaylistId(pl.id);
                                    setPlaylistPopoverOpen(false);
                                  }}
                                >
                                  {pl.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="ghost"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={!chosenPlaylistId}
                      onClick={confirmAdd}
                    >
                      Confirm
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {selectedMarkers.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => setSelectedMarkers([])}
                disabled={selectedMarkers.length === 0}
              >
                Clear Selection
              </Button>
            )}
          </div>



        </div>

      </div>


      {/* Scene Cards */}
      {scenes.length === 0 ? (
        <p>No clips found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {scenes.map((marker: any) => (
            <Card
              key={marker.id}
              className="relative p-0 group"
              style={{ minHeight: "320px" }}
            >
              <div
                className="absolute top-2 right-2 z-10 flex items-center justify-center"
                style={{ width: "32px", height: "32px" }}
              >
                <Checkbox
                  checked={selectedMarkers.includes(marker.id)}
                  onCheckedChange={() => toggleMarker(marker.id)}
                  className={`transition-opacity border border-black ${selectedMarkers.includes(marker.id)
                    ? "opacity-100 bg-white"
                    : "opacity-0 group-hover:opacity-100 bg-gray-200"
                    }`}
                  style={{ width: "24px", height: "24px" }}
                />
              </div>
              <CardHeader className="p-0">
                <div
                  className="relative"
                  style={{ paddingBottom: "56.25%" }}
                >
                  <img
                    src={marker.screenshot}
                    alt={marker.title}
                    className="absolute inset-0 w-full h-full object-cover rounded-t"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-lg mb-1">
                  {marker.title}
                </CardTitle>
                <p className="text-sm text-gray-500">
                  {marker.seconds}s – {marker.end_seconds}s
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
