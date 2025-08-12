import React, { useState, useCallback } from 'react';
import { Input } from '@mui/joy';
import type { InputProps } from '@mui/joy/Input';
import { formatSecondsToMMSS, parseTimeToSeconds } from '@/lib/formatLength';

interface TimeInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  value: number;
  onChange: (seconds: number) => void;
  placeholder?: string;
}

/**
 * TimeInput component that displays time as MM:SS but stores as seconds
 * Accepts input in both formats: "2:30" or "150"
 */
export default function TimeInput({ 
  value, 
  onChange, 
  placeholder = "0:00", 
  ...props 
}: TimeInputProps) {
  const [inputValue, setInputValue] = useState<string>(() => formatSecondsToMMSS(value));
  const [isError, setIsError] = useState(false);

  // Update display value when prop value changes (e.g., from clock buttons)
  React.useEffect(() => {
    setInputValue(formatSecondsToMMSS(value));
    setIsError(false);
  }, [value]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setInputValue(newValue);
    
    // Parse the input to seconds
    const seconds = parseTimeToSeconds(newValue);
    
    if (seconds !== null) {
      // Valid input
      setIsError(false);
      onChange(seconds);
    } else if (newValue.trim() === '') {
      // Empty input is allowed (null case)
      setIsError(false);
      // Don't call onChange for empty input to allow clearing
    } else {
      // Invalid input - show error state but don't call onChange
      setIsError(true);
    }
  }, [onChange]);

  const handleBlur = useCallback(() => {
    // On blur, if the input is invalid or empty, reset to formatted value
    const seconds = parseTimeToSeconds(inputValue);
    if (seconds === null && inputValue.trim() !== '') {
      // Invalid format, reset to last valid value
      setInputValue(formatSecondsToMMSS(value));
      setIsError(false);
    } else if (inputValue.trim() === '') {
      // Empty input, reset to formatted zero or current value
      setInputValue(formatSecondsToMMSS(value));
      setIsError(false);
    } else if (seconds !== null) {
      // Valid input, format it nicely
      setInputValue(formatSecondsToMMSS(seconds));
      setIsError(false);
    }
  }, [inputValue, value]);

  return (
    <Input
      {...props}
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      color={isError ? 'danger' : props.color}
      title={isError ? 'Invalid time format. Use MM:SS or seconds (e.g., "2:30" or "150")' : undefined}
    />
  );
}