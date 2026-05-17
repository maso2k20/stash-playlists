import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/joy';

// 1 = Dislike 👎, 2 = Like 👍, 3 = Love 👍👍, null = unrated
const LEVELS: { value: 1 | 2 | 3; emoji: string; label: string; color: 'danger' | 'success' }[] = [
  { value: 1, emoji: '👎', label: 'Dislike', color: 'danger' },
  { value: 2, emoji: '👍', label: 'Like',    color: 'success' },
  { value: 3, emoji: '👍👍', label: 'Love',  color: 'success' },
];

const SIZE_MAP = { sm: 'sm', md: 'md', lg: 'lg' } as const;

interface StarRatingProps {
  value?: number | null;
  onChange?: (rating: number | null) => void;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showClearButton?: boolean; // kept for API compat; clearing happens by clicking the active button
}

export default function StarRating({
  value = null,
  onChange,
  readonly = false,
  size = 'md',
}: StarRatingProps) {
  const btnSize = SIZE_MAP[size];
  const fontSize = size === 'sm' ? '0.9rem' : size === 'lg' ? '1.4rem' : '1.1rem';

  const handleClick = (level: number) => {
    if (readonly || !onChange) return;
    // clicking the active level clears it
    onChange(value === level ? null : level);
  };

  // Readonly: show only the selected emoji, or nothing if unrated
  if (readonly) {
    const active = LEVELS.find(l => l.value === value);
    if (!active) return null;
    return (
      <Tooltip title={active.label} variant="soft">
        <Box component="span" sx={{ fontSize, userSelect: 'none' }}>
          {active.emoji}
        </Box>
      </Tooltip>
    );
  }

  // Rated: show only the selected button — click it to clear
  if (value !== null) {
    const active = LEVELS.find(l => l.value === value)!;
    return (
      <Tooltip title="Clear rating" variant="soft">
        <IconButton
          size={btnSize}
          variant="solid"
          color={active.color}
          onClick={() => onChange?.(null)}
          sx={{ fontSize, minWidth: 'auto', minHeight: 'auto', px: 0.75 }}
        >
          {active.emoji}
        </IconButton>
      </Tooltip>
    );
  }

  // Unrated: show all three buttons to pick
  return (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
      {LEVELS.map(l => (
        <Tooltip key={l.value} title={l.label} variant="soft">
          <IconButton
            size={btnSize}
            variant="soft"
            color={l.color}
            onClick={() => handleClick(l.value)}
            sx={{ fontSize, minWidth: 'auto', minHeight: 'auto', px: 0.75 }}
          >
            {l.emoji}
          </IconButton>
        </Tooltip>
      ))}
    </Box>
  );
}
