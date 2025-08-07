'use client';

import { useState, useEffect } from 'react';
import { useQuery, gql } from '@apollo/client';
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";

const GET_ALL_PERFORMERS = gql`
  query GetAllPerformers($pageNumber: Int, $perPage: Int) {
    findPerformers(filter: { page: $pageNumber, per_page: $perPage }) {
      performers {
        id
        name
        image_path
        rating100
      }
    }
  }
`;

const FILTER_PERFORMERS = gql`
  query filterPerformers($filter: String!) {
    findPerformers(
      performer_filter: { name: { value: $filter, modifier: INCLUDES } }
    ) {
      performers {
        id
        name
        image_path
        rating100
      }
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
  const [filter, setFilter] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [pageNumber, setPageNumber] = useState(1);
  const perPage = 40;

  const [debouncedFilter, setDebouncedFilter] = useState(filter);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedFilter(filter), 300);
    return () => clearTimeout(handler);
  }, [filter]);

  const { data, loading, error } = useQuery(GET_ALL_PERFORMERS, {
    variables: { pageNumber, perPage },
    skip: !!debouncedFilter, // Skip paginated query if filter is active
  });

  const { data: filterData, loading: filterLoading } = useQuery(FILTER_PERFORMERS, {
    variables: { filter: debouncedFilter },
    skip: !debouncedFilter,
  });

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
      setAddedIds(prev => new Set(prev).add(actor.id));
    } catch (err) {
      console.error(err);
      alert('Could not add actor.');
    }
  };

  // Show loading for either query
  if (loading || filterLoading) return <p>Loading actors…</p>;
  if (error) return <p>Error: {error.message}</p>;

  // Use filtered results if searching, otherwise paginated results
  const allPerformers = filter
    ? filterData?.findPerformers?.performers ?? []
    : data?.findPerformers?.performers ?? [];
  const totalCount = data?.findPerformers?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  return (
    <div className="p-4">
      <input
        type="text"
        placeholder="Search actors…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="w-full p-2 mb-4 border rounded"
      />

      {/* Pagination at the top (only when not filtering) */}
      {!filter && (
        <Pagination className="mb-4">
          <PaginationContent>
            <PaginationItem>
              <PaginationLink
                onClick={() => setPageNumber(pageNumber - 1)}
                disabled={pageNumber === 1}
                href="#"
                isActive={false}
              >
                Previous
              </PaginationLink>
            </PaginationItem>
            {[...Array(totalPages)].map((_, idx) => (
              <PaginationItem key={idx}>
                <PaginationLink
                  onClick={() => setPageNumber(idx + 1)}
                  isActive={pageNumber === idx + 1}
                  href="#"
                >
                  {idx + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationLink
                onClick={() => setPageNumber(pageNumber + 1)}
                disabled={pageNumber === totalPages}
                href="#"
                isActive={false}
              >
                Next
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 mt-4">
        {allPerformers.map((actor: Performer) => {
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

      {/* Pagination at the bottom (only when not filtering) */}
      {!filter && (
        <Pagination className="mt-8">
          <PaginationContent>
            <PaginationItem>
              <PaginationLink
                onClick={() => setPageNumber(pageNumber - 1)}
                disabled={pageNumber === 1}
                href="#"
                isActive={false}
              >
                Previous
              </PaginationLink>
            </PaginationItem>
            {[...Array(totalPages)].map((_, idx) => (
              <PaginationItem key={idx}>
                <PaginationLink
                  onClick={() => setPageNumber(idx + 1)}
                  isActive={pageNumber === idx + 1}
                  href="#"
                >
                  {idx + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationLink
                onClick={() => setPageNumber(pageNumber + 1)}
                disabled={pageNumber === totalPages}
                href="#"
                isActive={false}
              >
                Next
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

