'use client';

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { formatLength } from "@/lib/formatLength";


export default function EditManualPlaylistPage() {
  const { id } = useParams();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  // Fetch playlist details and items on mount
  useEffect(() => {
    async function fetchPlaylist() {
      setLoading(true);
      const res = await fetch(`/api/playlists/${id}`);
      if (res.ok) {
        const playlist = await res.json();
        setName(playlist.name || "");
        setDescription(playlist.description || "");
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

    setLoading(false);
    if (res.ok && orderRes.ok) {
      router.push("/playlists");
    } else {
      alert("Failed to save changes.");
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
    const res = await fetch(`/api/playlists/${id}/items`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    setLoading(false);
    if (res.ok) {
      setItems(items.filter(item => item.id !== itemId));
    } else {
      alert("Failed to remove item.");
    }
  }

  // Save new order to backend
  async function saveOrder() {
    setSavingOrder(true);
    const orderedItems = items.map((item, idx) => ({
      id: item.id,
      itemOrder: idx,
    }));
    const res = await fetch(`/api/playlists/${id}/items/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedItems }),
    });
    setSavingOrder(false);
    if (!res.ok) {
      alert("Failed to save item order.");
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Edit Manual Playlist</h1>
      <div className="flex flex-col md:flex-row gap-8">
        {/* Left: Playlist Info */}
        <div className="md:w-1/3 space-y-4">
          <div>
            <Label htmlFor="playlist-name">Name</Label>
            <Input
              id="playlist-name"
              placeholder="Playlist name"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={loading}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="playlist-description">Description</Label>
            <Input
              id="playlist-description"
              placeholder="Playlist description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={loading}
              className="mt-1"
            />
          </div>
          <Button onClick={handleSave} disabled={loading || !name} className="w-full mt-2">
            {loading ? "Saving..." : "Save"}
          </Button>
        </div>

        {/* Right: Playlist Items */}
        <div className="md:w-2/3">
          <h2 className="text-xl font-semibold mb-2">Playlist Items</h2>
          <div className="space-y-2">
            {items.length === 0 && (
              <p className="text-muted-foreground">No items in this playlist.</p>
            )}
            {items.map((item, idx) => (
                <Card className="flex flex-row items-center w-full p-4 space-x-4">
                    {/* 16:9 aspect image */}
                    <div className="w-32 aspect-video flex-shrink-0">
                        <img
                        src={item.screenshot}
                        alt={item.title}
                        className="object-cover w-full h-full rounded-md"
                        />
                    </div>

                    {/* Title and description */}
                    <CardContent className="flex-1 p-0">
                        <h3 className="text-lg font-semibold">{item.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {formatLength(item.endTime - item.startTime)}
                        </p>
                    </CardContent>



                    <div className="flex flex-col space-y-2">
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => removeItem(item.id)}
                          aria-label="Remove from playlist"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Up/Down buttons */}
                    <div className="flex flex-col space-y-2">
                        <Button variant="outline" size="icon" onClick={() => moveItem(idx, "up")}>
                        <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => moveItem(idx, "down")}>
                        <ArrowDown className="h-4 w-4" />
                        </Button>
                    </div>
                </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}