'use client';

import { useState } from 'react';
import { useQuery, gql } from '@apollo/client';

const GET_ALL_PERFORMERS = gql`
  query GetAllPerformers {
    allPerformers {
      id
      name
      image_path
      rating100
    }
  }
`;

type Performer = {
  id: string;
  name: string;
  image_path: string;
  rating100: number;
};

export default function ActorGallery() {
  const { data, loading, error } = useQuery(GET_ALL_PERFORMERS);
  const [filter, setFilter] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const handleAdd = async (actor: Performer) => {
    try {
      const res = await fetch('/api/actors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: actor.id,
          name: actor.name,
          image_path: actor.image_path,
          rating: actor.rating100 ?? 0,
        }),
      });
      if (!res.ok) throw new Error('Failed to add actor');
      // Mark this one as added (client-side only)
      setAddedIds(prev => new Set(prev).add(actor.id));
    } catch (err) {
      console.error(err);
      alert('Could not add actor.');
    }
  };

  if (loading) return <p>Loading actors…</p>;
  if (error)   return <p>Error: {error.message}</p>;
  

  // client-side filtering
  const filtered = data.allPerformers.filter((a: any) =>
    a.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="p-4">
      <input
        type="text"
        placeholder="Search actors…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="w-full p-2 mb-4 border rounded"
      />

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-8">
        {filtered.map((actor: Performer) => {
          const isAdded = addedIds.has(actor.id);
          return (
            <div
              key={actor.id}
              className="border rounded overflow-hidden bg-white flex flex-col items-center relative"
              style={{ aspectRatio: '2/3', maxWidth: '300px' }}
            >
              <img
                src={actor.image_path}
                alt={actor.name}
                className="w-full h-full object-cover"
                style={{ aspectRatio: '2/3' }}
              />
              <div className="absolute bottom-0 w-full bg-black bg-opacity-60 text-white p-2 text-center">
                {actor.name}
              </div>
              <button
                onClick={() => handleAdd(actor)}
                disabled={isAdded}
                className={`
                  absolute top-2 right-2 px-2 py-1 text-sm rounded text-white
                  ${isAdded
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-green-500 hover:bg-green-600'}
                `}
              >
                {isAdded ? 'Added' : 'Add'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

