// src/components/PerformerCountTagSettings.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  FormControl,
  FormLabel,
  Select,
  Option,
  Button,
  IconButton,
  Chip,
  Autocomplete,
} from "@mui/joy";
import { Plus, X } from "lucide-react";
import { useStashTags } from "@/context/StashTagsContext";

type Tag = { id: string; name: string };

type PerformerCountRule = {
  performerCount: number;
  tagId: string;
};

interface PerformerCountTagSettingsProps {
  value: string; // JSON string
  onChange: (value: string) => void;
  error?: boolean;
}

export default function PerformerCountTagSettings({
  value,
  onChange,
  error
}: PerformerCountTagSettingsProps) {
  const { stashTags, loading: tagsLoading } = useStashTags();
  const [rules, setRules] = useState<PerformerCountRule[]>([]);

  // Convert stash tags to the format we need
  const tagOptions: Tag[] = useMemo(
    () => (stashTags || []).map((t: any) => ({
      id: String(t.id),
      name: String(t.name),
    })),
    [stashTags]
  );

  // Parse JSON value into rules array
  useEffect(() => {
    try {
      if (!value.trim()) {
        setRules([]);
        return;
      }
      
      const parsed = JSON.parse(value);
      const rulesArray: PerformerCountRule[] = [];
      
      for (const [performerCountStr, tagId] of Object.entries(parsed)) {
        const performerCount = parseInt(performerCountStr);
        if (!isNaN(performerCount) && typeof tagId === 'string') {
          rulesArray.push({ performerCount, tagId });
        }
      }
      
      // Sort by performer count for display
      rulesArray.sort((a, b) => a.performerCount - b.performerCount);
      setRules(rulesArray);
    } catch {
      setRules([]);
    }
  }, [value]);

  // Convert rules array back to JSON string
  const updateValue = (newRules: PerformerCountRule[]) => {
    const obj: Record<string, string> = {};
    for (const rule of newRules) {
      obj[rule.performerCount.toString()] = rule.tagId;
    }
    onChange(JSON.stringify(obj));
  };

  const addRule = () => {
    // Find the next available performer count (starting from 2)
    const existingCounts = new Set(rules.map(r => r.performerCount));
    let nextCount = 2;
    while (existingCounts.has(nextCount) && nextCount <= 20) {
      nextCount++;
    }
    
    if (nextCount > 20) return; // Max 20 performers
    
    const newRules = [...rules, { performerCount: nextCount, tagId: '' }];
    setRules(newRules);
    updateValue(newRules);
  };

  const removeRule = (index: number) => {
    const newRules = rules.filter((_, i) => i !== index);
    setRules(newRules);
    updateValue(newRules);
  };

  const updateRule = (index: number, field: keyof PerformerCountRule, value: number | string) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], [field]: value };
    setRules(newRules);
    updateValue(newRules);
  };

  const getTagName = (tagId: string): string => {
    const tag = tagOptions.find(t => t.id === tagId);
    return tag?.name || 'Unknown Tag';
  };

  // Generate performer count options (1-20)
  const performerCountOptions = Array.from({ length: 20 }, (_, i) => i + 1);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography level="body-sm" sx={{ fontWeight: 'lg' }}>
          Performer Count Rules
        </Typography>
        <Button
          size="sm"
          variant="outlined"
          startDecorator={<Plus size={14} />}
          onClick={addRule}
          disabled={rules.length >= 20}
        >
          Add Rule
        </Button>
      </Box>

      {rules.length === 0 ? (
        <Box
          sx={{
            p: 3,
            textAlign: 'center',
            border: '1px dashed',
            borderColor: 'neutral.300',
            borderRadius: 'md',
            bgcolor: 'neutral.50'
          }}
        >
          <Typography level="body-sm" sx={{ color: 'neutral.600' }}>
            No rules configured. Click "Add Rule" to create performer count based tag recommendations.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rules.map((rule, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 2,
                border: '1px solid',
                borderColor: error ? 'danger.300' : 'neutral.200',
                borderRadius: 'md',
                bgcolor: 'background.surface'
              }}
            >
              <FormControl sx={{ minWidth: 120 }}>
                <FormLabel sx={{ fontSize: '0.75rem' }}>Performers</FormLabel>
                <Select
                  size="sm"
                  value={rule.performerCount}
                  onChange={(_e, val) => val && updateRule(index, 'performerCount', val)}
                >
                  {performerCountOptions
                    .filter(count => count === rule.performerCount || !rules.some(r => r.performerCount === count))
                    .map(count => (
                      <Option key={count} value={count}>
                        {count} performer{count !== 1 ? 's' : ''}
                      </Option>
                    ))}
                </Select>
              </FormControl>

              <FormControl sx={{ flex: 1 }}>
                <FormLabel sx={{ fontSize: '0.75rem' }}>Recommended Tag</FormLabel>
                <Autocomplete
                  size="sm"
                  options={tagOptions}
                  value={tagOptions.find(t => t.id === rule.tagId) || null}
                  onChange={(_e, val) => updateRule(index, 'tagId', val?.id || '')}
                  getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
                  isOptionEqualToValue={(a, b) => a?.id === b?.id}
                  placeholder="Select tag to recommend..."
                  loading={tagsLoading}
                  sx={{ minWidth: 200 }}
                />
              </FormControl>

              <IconButton
                size="sm"
                variant="soft"
                color="danger"
                onClick={() => removeRule(index)}
              >
                <X size={14} />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      {rules.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography level="body-xs" sx={{ color: 'neutral.600', mb: 1 }}>
            Preview: When editing markers for scenes with...
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {rules
              .filter(rule => rule.tagId) // Only show rules with tags selected
              .map((rule, index) => (
                <Chip
                  key={index}
                  size="sm"
                  variant="soft"
                  color="primary"
                >
                  {rule.performerCount} performer{rule.performerCount !== 1 ? 's' : ''} → {getTagName(rule.tagId)}
                </Chip>
              ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}