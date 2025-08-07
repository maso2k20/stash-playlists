import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

// Types
interface Actor {
  id: string;
  name: string;
}
interface Tag {
  id: string;
  label: string;
}
interface SmartPlaylistRuleBuilderProps {
  tags?: Tag[];
  onChange: (rules: { actorIds: string[]; tagIds: string[] }) => void;
  initialRules?: { actorIds: string[]; tagIds: string[] };
}

export default function SmartPlaylistRuleBuilder({ tags = [], onChange, initialRules }: SmartPlaylistRuleBuilderProps) {
  const [actors, setActors] = useState<Actor[]>([]);
  const [actorQuery, setActorQuery] = useState('');
  const [selectedActors, setSelectedActors] = useState<Actor[]>([]);
  const [tagQuery, setTagQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);

  // Fetch actors and sort
  useEffect(() => {
    async function fetchActors() {
      try {
        const res = await fetch('/api/actors');
        const data: Actor[] = await res.json();
        setActors((data || []).sort((a, b) => a.name.localeCompare(b.name)));
      } catch (err) {
        console.error('Error loading actors:', err);
      }
    }
    fetchActors();
  }, []);

  // Initialize selections
  useEffect(() => {
    if (initialRules) {
      if (initialRules.actorIds?.length && actors.length && selectedActors.length === 0) {
        setSelectedActors(actors.filter(a => initialRules.actorIds.includes(a.id)));
      }
      if (initialRules.tagIds?.length && tags.length && selectedTags.length === 0) {
        setSelectedTags(tags.filter(t => initialRules.tagIds.includes(t.id)));
      }
    }
  }, [initialRules, actors, tags, selectedActors.length, selectedTags.length]);

  // Notify parent
  useEffect(() => {
    onChange({
      actorIds: selectedActors.map(a => a.id),
      tagIds: selectedTags.map(t => t.id),
    });
  }, [selectedActors, selectedTags, onChange]);

  const filteredActors = actorQuery
    ? actors.filter(a => a.name.toLowerCase().includes(actorQuery.toLowerCase()))
    : actors;
  const filteredTags = tagQuery
    ? tags.filter(t => t.label.toLowerCase().includes(tagQuery.toLowerCase()))
    : tags;

  const toggleActor = (actor: Actor) =>
    setSelectedActors(prev =>
      prev.some(a => a.id === actor.id) ? prev.filter(a => a.id !== actor.id) : [...prev, actor]
    );
  const toggleTag = (tag: Tag) =>
    setSelectedTags(prev =>
      prev.some(t => t.id === tag.id) ? prev.filter(t => t.id !== tag.id) : [...prev, tag]
    );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full min-h-0">
      {/* Actors Column */}
      <div className="flex flex-col h-full min-h-0">
        <label className="block mb-2 font-medium">Actors</label>
        <Command className="border rounded-lg flex flex-col h-full min-h-0">
          <CommandInput
            placeholder="Search actors..."
            value={actorQuery}
            onValueChange={setActorQuery}
          />
          <CommandList className="flex-1 overflow-auto min-h-0">
            <CommandEmpty>No actors found.</CommandEmpty>
            <CommandGroup>
              {filteredActors.map(actor => (
                <CommandItem
                  key={actor.id}
                  onSelect={() => toggleActor(actor)}
                  className={cn(
                    'cursor-pointer',
                    selectedActors.some(a => a.id === actor.id) && 'font-semibold'
                  )}
                >
                  {actor.name}
                  {selectedActors.some(a => a.id === actor.id) && <span className="ml-auto">✓</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="mt-2 flex flex-wrap gap-2 overflow-auto p-1">
          {selectedActors.map(actor => (
            <Button
              key={actor.id}
              size="sm"
              variant="outline"
              onClick={() => toggleActor(actor)}
            >
              {actor.name} ✕
            </Button>
          ))}
        </div>
      </div>

      {/* Tags Column */}
      <div className="flex flex-col h-full">
        <label className="block mb-2 font-medium">Tags</label>
        <Command className="border rounded-lg flex flex-col">
          <CommandInput
            placeholder="Search tags..."
            value={tagQuery}
            onValueChange={setTagQuery}
          />
          <CommandList className="flex-1 overflow-auto">
            <CommandEmpty>No tags found.</CommandEmpty>
            <CommandGroup>
              {filteredTags.map(tag => (
                <CommandItem
                  key={tag.id}
                  onSelect={() => toggleTag(tag)}
                  className={cn(
                    'cursor-pointer',
                    selectedTags.some(t => t.id === tag.id) && 'font-semibold'
                  )}
                >
                  {tag.label}
                  {selectedTags.some(t => t.id === tag.id) && <span className="ml-auto">✓</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="mt-2 flex flex-wrap gap-2 overflow-auto p-1">
          {selectedTags.map(tag => (
            <Button
              key={tag.id}
              size="sm"
              variant="outline"
              onClick={() => toggleTag(tag)}
            >
              {tag.label} ✕
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
