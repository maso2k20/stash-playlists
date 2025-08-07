"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import VideoJS from "@/components/videojs/VideoJS";
import { Card, CardContent } from "@/components/ui/card";

type Scene = {
  id: string;
  item: {
    stream: string;
    title: string;
    startTime: number;
    endTime: number;
  };
};

type Playlist = {
  name: string;
  items: Scene[];
};

function PlaylistItem({
  scene,
  index,
  isActive,
  onClick,
}: {
  scene: Scene;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const style = {
    cursor: "pointer",
    background: isActive ? "var(--shadcn-background-active)" : undefined,
  };

  return (
    <Card
      style={style}
      className="mb-2"
      onClick={onClick}
    >
      <CardContent>
        <div className="flex justify-between items-center">
          <div>
            <strong>{scene.item.title}</strong>
            <div className="text-sm text-muted-foreground">
              {scene.item.startTime}s - {scene.item.endTime}s
            </div>
          </div>
          <div className="text-xs text-muted-foreground">#{index + 1}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function PlaylistDetailPage() {
  const { id } = useParams();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);

  // Fetch playlist
  useEffect(() => {
    fetch(`/api/playlists?id=${id}`)
      .then((res) => res.json())
      .then((data) => setPlaylist(data));
  }, [id]);

  // Reset index on new playlist
  useEffect(() => {
    setCurrentIndex(0);
    setHasStarted(false);
  }, [playlist]);

  const items = playlist?.items ?? [];

  const videoJsOptions = {
    autoplay: false,
    controls: true,
    responsive: true,
    fluid: false,
    width: 1920,
    height: 1080,
    sources:
      items.length > 0
        ? [
            {
              src: items[currentIndex].item.stream,
              type: "video/mp4",
            },
          ]
        : [],
  };

  const handlePlayerReady = (player: any) => {
    playerRef.current = player;
    player.muted(true);
    player.on("waiting", () => console.log("waiting"));
    player.on("dispose", () => console.log("dispose"));
  };

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.muted(isMuted);
    }
  }, [isMuted]);

  if (!playlist) return <div>Loading...</div>;

  const offset = items.length
    ? {
        start: items[currentIndex].item.startTime,
        end: items[currentIndex].item.endTime,
        restart_beginning: false,
      }
    : undefined;

  return (
    <div className="p-4 pt-10 h-[80vh] flex gap-8">
      {/* Left: Video Player */}
      <div className="flex-1 flex flex-col items-center">
        <div className="video-wrapper">
          <VideoJS
            options={videoJsOptions}
            offset={offset}
            onReady={handlePlayerReady}
            hasStarted={hasStarted}
            onEnded={() => {
              setHasStarted(true);
              if (currentIndex < items.length - 1) {
                setCurrentIndex((i) => i + 1);
              }
            }}
          />
          <video ref={videoRef} className="hidden" />
        </div>

        <div className="flex gap-4 mt-4">
          <button
            className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50"
            onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
            disabled={currentIndex === 0}
          >
            Previous
          </button>
          <button
            className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50"
            onClick={() =>
              setCurrentIndex((i) => Math.min(i + 1, items.length - 1))
            }
            disabled={currentIndex === items.length - 1}
          >
            Next
          </button>
          <button
            className="px-4 py-2 bg-gray-300 rounded"
            onClick={() => setIsMuted((m) => !m)}
          >
            {isMuted ? "Unmute" : "Mute"}
          </button>
        </div>
      </div>

      {/* Right: Static Playlist */}
      <aside className="w-104 bg-background rounded-lg p-4 overflow-y-auto h-full">
        <h2 className="text-xl font-semibold mb-4">{playlist.name}</h2>
        <button
          className="mb-4 px-4 py-2 bg-blue-500 text-white rounded"
          onClick={() => {
            const shuffled = shuffleArray(items);
            setPlaylist({ ...playlist, items: shuffled });
            setCurrentIndex(0); // Optionally start at the first shuffled item
          }}
        >
          Shuffle
        </button>
        {items.map((scene, idx) => (
          <PlaylistItem
            key={scene.id}
            scene={scene}
            index={idx}
            isActive={idx === currentIndex}
            onClick={() => setCurrentIndex(idx)}
          />
        ))}
      </aside>
    </div>
  );
}
