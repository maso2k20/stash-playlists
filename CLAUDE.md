# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build production version (automatically runs `prisma generate` first)
- `npm run start` - Start production server
- `npm run lint` - Run ESLint checks

### Database Commands

- `npx prisma generate` - Generate Prisma client after schema changes
- `npx prisma migrate dev` - Create and apply new migrations in development
- `npx prisma migrate deploy` - Apply migrations in production
- `npx prisma db seed` - Seed database with initial data
- `npx prisma studio` - Open Prisma Studio for database management

## Architecture Overview

This is a Next.js application that creates playlists from Stash server markers, integrating with Stash's GraphQL API for media content management.

### Core Technologies
- **Next.js 15** with App Router and standalone output for Docker deployment
- **Prisma** with SQLite database for local data persistence
- **Apollo Client** for GraphQL communication with Stash server
- **Material-UI (Joy)** and **shadcn/ui** components for the interface
- **Tailwind CSS** for styling

### Key Components

**Data Layer:**
- `src/lib/prisma.ts` - Database client with development query logging
- `src/lib/smartPlaylistServer.ts` - Core smart playlist builder and Stash GraphQL integration
- `prisma/schema.prisma` - Database schema with Settings, Actor, Playlist, PlaylistItem, and Item models

**Playlist System:**
- Manual playlists: User-curated item collections
- Smart playlists: Auto-generated based on actor/tag/rating conditions with configurable clip timing
- Items represent video segments with start/end times, screenshots, stream URLs, and optional 1-5 star ratings

**Stash Integration:**
- Configuration via Settings table (STASH_SERVER, STASH_API) with automatic initialization
- Consistent authentication using `Authorization: Bearer` headers for GraphQL endpoints
- URL-based API key authentication for media/file endpoints (`?api_key=`)
- Connection testing endpoint with detailed error reporting and version detection
- Proxy endpoint at `/api/stash-graphql` for client-side GraphQL requests

**State Management:**
- `src/app/context/SettingsContext.tsx` - Global settings context
- `src/components/ApolloProvider.tsx` - GraphQL client provider

### API Endpoints Structure
- `/api/actors` - Actor management and scene retrieval
- `/api/playlists` - CRUD operations and smart playlist generation
- `/api/playlists/[id]/items` - Playlist item management with ordering
- `/api/playlists/[id]/image` - Playlist cover image upload/delete operations
- `/api/playlist-images/[filename]` - Serve playlist images from persistent storage
- `/api/items` - Item creation and management
- `/api/items/[id]/rating` - Individual item rating GET/PATCH operations
- `/api/items/ratings` - Bulk rating lookup for multiple markers by ID
- `/api/items/filter` - Filter items by minimum rating
- `/api/settings` - Configuration management with auto-initialization and validation
- `/api/settings/test-connection` - Test Stash server connectivity and authentication
- `/api/stash-graphql` - Proxy to Stash server GraphQL

### Docker Deployment
- Multi-stage build with Prisma generation before Next.js build
- Production database at `/data/prod.db` (mounted volume)
- Playlist images stored at `/data/playlist-images/` (persistent storage)
- Automatic migration deployment and seeding via `entrypoint.sh`
- Port 3000 exposed

### Smart Playlist Logic
Located in `src/lib/smartPlaylistServer.ts:buildItemsForPlaylist()`:
- Queries Stash for scene markers matching actor/tag conditions
- Applies rating filters (minimum rating threshold) by checking database
- Creates video clips with configurable before/after timing around markers using settings defaults
- Generates deduped titles combining scene and marker names
- Provides preview, screenshot, and stream URLs with API key authentication

### Rating System
Comprehensive 1-5 star rating system for markers/items:
- **Database**: `rating` field in Item table (nullable integer)
- **UI Component**: `src/components/StarRating.tsx` - Interactive star rating with MUI Joy
- **Scene Management**: Rate markers directly on `/scenes/[id]` page
- **Playlist Player**: Real-time rating of currently playing clips with auto-save
- **Actor Pages**: Display existing ratings via bulk lookup API for visual feedback
- **Smart Playlist Integration**: Filter by minimum rating in rule builder
- **Auto-creation**: Items are created automatically when rating non-existent markers
- **API**: Full CRUD operations for ratings with validation and error handling
- **Bulk Operations**: Efficient rating lookup for multiple markers via `/api/items/ratings`

### Playlist Player Features
Enhanced playlist playback experience at `/playlists/[id]`:
- **Current Item Display**: Shows title and rating component below video player
- **Real-time Rating**: Star rating component with immediate persistence via API
- **Progress Tracking**: Automatically hides completed items from playlist view
- **Visual Feedback**: Current item highlighting with primary colors, played items at 50% opacity
- **Shuffle Support**: Maintains play order consistency while filtering display
- **Responsive Design**: Consistent JoyUI styling with proper spacing and typography
- **Performance Optimized**: Uses React.memo, useCallback, and proper useEffect dependencies

### Playlist Management Features
Enhanced playlist browsing and organization at `/playlists`:
- **Search Functionality**: Real-time filtering by playlist name and description
- **Sorting Options**: Sort by name (A-Z/Z-A), item count (high/low), or duration (long/short)
- **Cover Images**: Optional 9:16 portrait images displayed on playlist cards
- **Responsive Layout**: Clean JoyUI header design with search and sort controls that stack on mobile
- **Visual Feedback**: Proper loading states, empty states, and search result indicators
- **Performance Optimized**: Uses useMemo for efficient filtering and sorting operations

### Actor Browsing System
Enhanced marker browsing and selection on `/actors/[id]` pages:
- **Advanced Filtering**: Multi-select tag filtering with real-time search across marker titles
- **Comprehensive Sorting**: Sort by title (A-Z/Z-A), duration (shortest/longest), and rating (highest/lowest)
- **Visual Selection**: Full-card clickable interface with selection overlays and hover effects
- **Rating Display**: Shows existing star ratings for previously rated markers via bulk API lookup
- **Efficient Data Loading**: Loads all markers at once for proper client-side filtering and sorting
- **Responsive Controls**: Search, sort, and tag filter controls in single row layout that stacks on mobile
- **Smart Empty States**: Different messages for no data vs filtered results with quick clear actions
- **Performance Optimized**: Uses useMemo for instant filtering/sorting with proper dependency tracking
- **Playlist Integration**: Selected markers can be bulk-added to manual playlists with dialog interface

### Playlist Cover Image System
Comprehensive image management for playlist personalization:
- **Database Integration**: `image` field in Playlist model stores filename references
- **File Storage**: Images stored in `/data/playlist-images/` for Docker persistence
- **Image Processing**: Auto-resize to 270x480px (9:16 ratio) with Sharp optimization
- **Upload Component**: `src/components/PlaylistImageUpload.tsx` with drag-and-drop interface
- **Format Support**: JPEG, PNG, WebP with 5MB size limit and validation
- **API Endpoints**: 
  - `POST/DELETE /api/playlists/[id]/image` for upload/removal operations
  - `GET /api/playlist-images/[filename]` for serving with cache headers
- **UI Integration**: 
  - Playlist cards display 96x170px thumbnails alongside content
  - Both manual and smart playlist editors include image management
  - Horizontal layout in editors with expandable description fields
- **Automatic Cleanup**: Images automatically deleted when playlists are removed
- **Security**: Path traversal protection and file type validation

### Settings Management System
Comprehensive configuration system with type safety and validation:
- **Typed Definitions**: `src/lib/settingsDefinitions.ts` with validation, categories, and defaults
- **Auto-Initialization**: Missing settings automatically created with defaults on first load
- **Categorized UI**: Settings grouped by category (Stash Integration, Appearance, Playback) with accordion layout
- **Real-time Validation**: Input validation with helpful error messages and visual feedback
- **Connection Testing**: Built-in Stash server connectivity testing with detailed diagnostics
- **Extensible Architecture**: Easy to add new settings by updating definitions file
- **Setting Types**: Support for text, URL, number, and select input types with appropriate validation
- **Default Values**: 
  - `STASH_SERVER`: Empty (required for connection)
  - `STASH_API`: Empty (required for authentication)  
  - `THEME_MODE`: "system" (light/dark/system options)
  - `DEFAULT_CLIP_BEFORE`: "0" (seconds before marker to start clips)
  - `DEFAULT_CLIP_AFTER`: "0" (seconds after marker to end clips)