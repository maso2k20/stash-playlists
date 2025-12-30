// Shared type definitions for scene markers

export type Tag = {
    id: string;
    name: string;
    children?: Tag[];
};

export type Marker = {
    id: string;
    title: string;
    seconds: number;
    end_seconds: number | null;
    primary_tag?: Tag | null;
    tags?: Tag[];
};

export type Draft = {
    title: string;
    seconds: number;
    end_seconds: number | null;
    primary_tag_id: string | null;
    tag_ids: string[];
};

// Extended marker type that combines server data with draft overlay
export type MarkerWithDraft = Marker & {
    draft?: Draft;
    isDirty?: boolean;
    isNew?: boolean;
};

// Timeline-specific types
export type MarkerForTimeline = {
    id: string;
    start: number;
    end: number;
    title: string;
    primaryTagName?: string;
    color?: string;
    isDirty: boolean;
    isNew: boolean;
    isActive: boolean;
};

export type MarkerWithLane = MarkerForTimeline & {
    lane: number;
};

// Selection rectangle for drag-select
export type SelectionRect = {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
};
