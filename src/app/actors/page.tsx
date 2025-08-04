import Link from 'next/link';

type Actor = {
  id: string;
  name: string;
  image_path: string;
  rating: number;
  createdAt: string;
  updatedAt: string;
};

export default async function MyActorsPage() {
  // Server-side fetch directly from our API route:
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/actors`, { cache: 'no-store' });

  const actors: Actor[] = await res.json();

  // Sort actors by name (case-insensitive)
  const sortedActors = actors.slice().sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  return (
    <main className="p-4">
      {sortedActors.length === 0 && <p>You haven’t added any actors yet.</p>}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-8">
        {sortedActors.map(actor => (
          <Link
            key={actor.id}
            href={`/actors/${actor.id}`}
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
          </Link>
        ))}
      </div>
    </main>
  );
}
