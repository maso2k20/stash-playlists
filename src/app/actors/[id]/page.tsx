// filepath: c:\stash-playlists\src\app\actors\[id]\page.tsx
import ActorMarkers from './ActorMarkers';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ActorMarkers actorId={id} />;
}