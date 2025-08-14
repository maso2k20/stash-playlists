import * as React from 'react';
import {
  Sheet, Box, Input, List, ListItem, ListItemButton,
  ListItemDecorator, ListItemContent, Typography,
  AspectRatio, IconButton
} from '@mui/joy';
import DeleteForeverRounded from '@mui/icons-material/DeleteForeverRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import ShuffleRounded from '@mui/icons-material/ShuffleRounded';
import { formatLength } from "@/lib/formatLength";

type PlaylistItem = {
  id: string; // content item id
  item: {
    id: string;
    stream: string;
    title: string;
    startTime: number;
    endTime: number;
    screenshot?: string;
    rating?: number | null;
  };
};

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function PlaylistDetail({
  items,
  currentIndex,            // index within the play order (see parent notes)
  setCurrentIndex,         // sets the play-order index
  onRemoveItem,
  onDoubleClickPlay,
  title,
  showCounts = true,
  // NEW: parent-controlled play order (array of indices into `items`)
  playOrder,
  onOrderChange,           // called with new order (indices) on shuffle
  playedItemIndices,       // set of indices for items that have been played
}: {
  items: PlaylistItem[];
  currentIndex: number;
  setCurrentIndex: (i: number) => void;
  onRemoveItem?: (id: string) => void;
  onDoubleClickPlay?: (i: number) => void;
  title?: string;
  showCounts?: boolean;
  playOrder?: number[];
  onOrderChange?: (order: number[]) => void;
  playedItemIndices?: Set<number>;
}) {
  const [q, setQ] = React.useState('');

  // If parent doesn't supply a playOrder, manage one locally
  const [localOrder, setLocalOrder] = React.useState<number[]>(
    () => items.map((_, i) => i)
  );
  React.useEffect(() => {
    // reset order when items change
    const fresh = items.map((_, i) => i);
    setLocalOrder(fresh);
  }, [items]);

  const order = playOrder ?? localOrder;

  // Build ordered list, filter out played items, then filter by query; keep original indices (idx)
  const filtered = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    let base = order.map((idx) => ({ it: items[idx], idx }));
    
    // Filter out played items (but keep current item visible)
    if (playedItemIndices && playedItemIndices.size > 0) {
      const currentItemIndex = order[currentIndex] ?? -1;
      base = base.filter(({ idx }) => 
        !playedItemIndices.has(idx) || idx === currentItemIndex
      );
    }
    
    if (!query) return base;
    return base.filter(({ it }) => it.item.title.toLowerCase().includes(query));
  }, [items, order, q, playedItemIndices, currentIndex]);

  const handleShuffle = () => {
    const newOrder = shuffleArray(order);
    if (onOrderChange) {
      onOrderChange(newOrder);
      // parent should also setCurrentIndex(0) and update player source
    } else {
      setLocalOrder(newOrder);
      setCurrentIndex(0);
    }
  };

  const totalCount = items.length;
  const shownCount = filtered.length;
  const isFiltered = q.trim().length > 0;

  return (
    <Sheet
      variant="plain"
      sx={{
        p: 1.5,
        borderRadius: 'lg',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* Sticky header: title + counts + search/controls */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 1, pb: 1, backgroundColor: 'background.surface' }}>
        {(title || showCounts) && (
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
            <Typography level="title-md" sx={{ mr: 1 }} noWrap>
              {title ?? 'Playlist'}
            </Typography>
            {showCounts && (
              <Typography level="body-sm" sx={{ opacity: 0.8 }}>
                {isFiltered ? `${shownCount} shown · ${totalCount} clips` : `${totalCount} clips`}
              </Typography>
            )}
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Input
            size="sm"
            startDecorator={<SearchRounded />}
            placeholder="Search scenes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            sx={{ flex: 1 }}
          />
          <IconButton
            size="sm"
            variant="soft"
            onClick={handleShuffle}
            aria-label="Shuffle playlist order"
            title="Shuffle"
          >
            <ShuffleRounded />
          </IconButton>
        </Box>
      </Box>

      {/* Scrollable list */}
      <List
        size="lg"
        sx={{
          p: 0,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {filtered.map(({ it, idx }) => {
          const dur = Math.max(0, (it.item.endTime ?? 0) - (it.item.startTime ?? 0));
          const isCurrentItem = idx === (order[currentIndex] ?? -1);
          const isPlayedItem = playedItemIndices?.has(idx) && !isCurrentItem;
          
          return (
            <ListItem key={`${it.id}-${idx}`} sx={{ px: 0 }}>
              <ListItemButton
                selected={isCurrentItem}
                onClick={() => {
                  // when user clicks a row, jump to its position IN THE ORDER
                  const orderPos = order.indexOf(idx);
                  if (orderPos !== -1) setCurrentIndex(orderPos);
                }}
                onDoubleClick={() => {
                  const orderPos = order.indexOf(idx);
                  if (orderPos !== -1) onDoubleClickPlay?.(orderPos);
                }}
                sx={{
                  display: 'flex',
                  gap: 1.5,
                  py: 1.25,
                  width: '100%',
                  minWidth: 0,
                  opacity: isPlayedItem ? 0.5 : 1,
                  '&.Mui-selected': { 
                    backgroundColor: 'primary.softBg',
                    borderLeft: 3,
                    borderColor: 'primary.500',
                  },
                  '&:hover': {
                    backgroundColor: isCurrentItem ? 'primary.softHoverBg' : 'neutral.softHoverBg',
                  },
                }}
              >
                <ListItemDecorator sx={{ alignSelf: 'center', mr: 1.5 }}>
                  <AspectRatio
                    ratio="16/9"
                    sx={{
                      width: { xs: 96, sm: 120, md: 140 },
                      borderRadius: 'sm',
                      overflow: 'hidden',
                    }}
                  >
                    {it.item.screenshot ? (
                      <img src={it.item.screenshot} alt="" loading="lazy" />
                    ) : (
                      <div />
                    )}
                  </AspectRatio>
                </ListItemDecorator>

                <ListItemContent sx={{ minWidth: 0, overflow: 'hidden' }}>
                  <Typography level="title-md" noWrap sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {it.item.title || 'Untitled'}
                  </Typography>
                  <Typography level="body-sm" sx={{ opacity: 0.8 }}>
                    {formatLength(dur)}
                  </Typography>
                </ListItemContent>

                {onRemoveItem && (
                  <IconButton
                    size="sm"
                    variant="plain"
                    color="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveItem(it.id);
                    }}
                    aria-label="Remove from playlist"
                  >
                    <DeleteForeverRounded />
                  </IconButton>
                )}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Sheet>
  );
}
