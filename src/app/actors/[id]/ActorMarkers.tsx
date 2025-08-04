// filepath: c:\stash-playlists\src\app\actors\[id]\ActorMarkers.tsx
"use client";
import { useQuery, gql } from '@apollo/client';

const GET_MARKERS_FOR_ACTOR = gql`
  query findActorsSceneMarkers($actorId: ID!, $tagID: ID!) {
    findSceneMarkers(
      scene_marker_filter: {
        performers: { modifier: EQUALS, value: [$actorId] }
        tags: { modifier: INCLUDES, value: [$tagID] }
      }
    ) {
      scene_markers {
        id
        title
        end_seconds
        seconds
        updated_at
        preview
        screenshot
        stream
        primary_tag {
          name
          id
        }
        scene {
          id
          paths {
            stream
          }
        }
      }
    }
  }
`;

export default function ActorMarkers({ actorId }: { actorId: string }) {
  const { data, loading, error } = useQuery(GET_MARKERS_FOR_ACTOR, {
    variables: { actorId, tagID: 6 },
    fetchPolicy: 'cache-and-network',
  });

  if (loading) return <p>Loading markers…</p>;
  if (error) return <p>Error: {error.message}</p>;

  const scenes = data?.findSceneMarkers?.scene_markers ?? [];

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">Markers for Actor {actorId}</h2>
      {scenes.length === 0 ? (
        <p>No markers found.</p>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {scenes.map((marker: any) => (
            <div
              key={marker.id}
              className="bg-white rounded shadow overflow-hidden flex flex-col"
              style={{ aspectRatio: '16/9', maxWidth: '500px' }}
            >
              <img
                src={marker.preview}
                alt={marker.title}
                className="w-full h-full object-cover"
                style={{ aspectRatio: '16/9' }}
              />
              <div className="p-3">
                <h3 className="font-semibold text-lg">{marker.title}</h3>
                <p className="text-gray-500 text-sm">{marker.seconds}s</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}