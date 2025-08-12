import React, { useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/joy';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';

interface StarRatingProps {
  value?: number | null;
  onChange?: (rating: number | null) => void;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showClearButton?: boolean;
}

export default function StarRating({
  value = null,
  onChange,
  readonly = false,
  size = 'md',
  showClearButton = true,
}: StarRatingProps) {
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  
  const maxStars = 5;
  const currentRating = hoveredRating !== null ? hoveredRating : (value || 0);

  const handleStarClick = (rating: number) => {
    if (readonly || !onChange) return;
    // If clicking the same rating, clear it
    if (value === rating && showClearButton) {
      onChange(null);
    } else {
      onChange(rating);
    }
  };

  const handleStarHover = (rating: number | null) => {
    if (readonly) return;
    setHoveredRating(rating);
  };

  const getIconSize = () => {
    switch (size) {
      case 'sm': return 'small';
      case 'lg': return 'large';
      default: return 'medium';
    }
  };

  const getButtonSize = () => {
    switch (size) {
      case 'sm': return 'sm';
      case 'lg': return 'lg';
      default: return 'md';
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
      }}
      onMouseLeave={() => handleStarHover(null)}
    >
      {Array.from({ length: maxStars }, (_, index) => {
        const starValue = index + 1;
        const isFilled = starValue <= currentRating;
        
        const StarComponent = isFilled ? StarIcon : StarBorderIcon;
        
        return (
          <Tooltip
            key={starValue}
            title={readonly ? `${value || 0} stars` : `${starValue} star${starValue === 1 ? '' : 's'}`}
            variant="soft"
          >
            <IconButton
              size={getButtonSize()}
              variant="plain"
              color={isFilled ? 'warning' : 'neutral'}
              disabled={readonly}
              onClick={() => handleStarClick(starValue)}
              onMouseEnter={() => handleStarHover(starValue)}
              sx={{
                minHeight: 'auto',
                minWidth: 'auto',
                p: 0.25,
                '--IconButton-radius': '2px',
                ...(readonly && {
                  cursor: 'default',
                  '&:hover': {
                    backgroundColor: 'transparent',
                  },
                }),
                ...(!readonly && {
                  '&:hover': {
                    backgroundColor: 'var(--joy-palette-warning-softHoverBg)',
                  },
                }),
              }}
            >
              <StarComponent 
                fontSize={getIconSize() as any}
                sx={{
                  color: isFilled 
                    ? 'var(--joy-palette-warning-500)' 
                    : 'var(--joy-palette-neutral-400)',
                  ...(hoveredRating !== null && !readonly && {
                    transition: 'color 0.1s ease',
                  }),
                }}
              />
            </IconButton>
          </Tooltip>
        );
      })}
      
      {!readonly && value !== null && showClearButton && (
        <Tooltip title="Clear rating" variant="soft">
          <IconButton
            size="sm"
            variant="soft"
            color="neutral"
            onClick={() => onChange?.(null)}
            sx={{
              ml: 0.5,
              fontSize: '0.75rem',
              minHeight: 'auto',
              minWidth: 'auto',
              px: 0.5,
              py: 0.25,
            }}
          >
            ×
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}