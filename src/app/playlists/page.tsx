"use client";

import { useState, useEffect, ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Plus } from "lucide-react";
import Link from "next/link";

interface Playlist {
  id: string;
  name: string;
  description?: string;
  type: "MANUAL" | "SMART";
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/playlists")
      .then((res) => res.json())
      .then(setPlaylists)
      .catch(console.error);
  }, []);

  const createPlaylist = async () => {
    if (!newName.trim()) return;
    const response = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, description: newDesc, type: "MANUAL" }),
    });
    if (response.ok) {
      const created = await response.json();
      setPlaylists((prev) => [...prev, created]);
      setNewName("");
      setNewDesc("");
      setIsCreateOpen(false);
    }
  };

  const confirmDelete = (id: string) => {
    setToDeleteId(id);
    setIsDeleteOpen(true);
  };

  const deletePlaylist = async () => {
    if (!toDeleteId) return;
    const response = await fetch(`/api/playlists?id=${toDeleteId}`, { method: "DELETE" });
    if (response.ok) {
      setPlaylists((prev) => prev.filter((p) => p.id !== toDeleteId));
      setToDeleteId(null);
      setIsDeleteOpen(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      {/* Create Playlist Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogTrigger asChild>
          <Button className="flex items-center space-x-1">
            <Plus size={16} />
            <span>New Playlist</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Playlist</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              placeholder="Name"
              value={newName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
            />
            <Input
              placeholder="Description"
              value={newDesc}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewDesc(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createPlaylist}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Are you sure you want to delete this playlist? This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>
              No
            </Button>
            <Button variant="destructive" onClick={deletePlaylist}>
              Yes, Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Playlists Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {playlists.map((playlist) => (
          <Card key={playlist.id} className="shadow p-4">
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <Link href={`/playlists/${playlist.id}`} className="hover:underline">
                  {playlist.name}
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => confirmDelete(playlist.id)}
                >
                  <Trash2 />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {playlist.description || "No description"}
              </p>
            </CardContent>
            <CardFooter>
              <span className="text-xs uppercase font-medium">
                {playlist.type.toLowerCase()} playlist
              </span>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
