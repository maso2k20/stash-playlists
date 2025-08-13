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
- Configuration via environment variables or Settings table (STASH_GRAPHQL_URL, STASH_API_KEY)
- Automatic URL/API key swap detection for common configuration mistakes
- Proxy endpoint at `/api/stash-graphql` for client-side GraphQL requests

**State Management:**
- `src/app/context/SettingsContext.tsx` - Global settings context
- `src/components/ApolloProvider.tsx` - GraphQL client provider

### API Endpoints Structure
- `/api/actors` - Actor management and scene retrieval
- `/api/playlists` - CRUD operations and smart playlist generation
- `/api/playlists/[id]/items` - Playlist item management with ordering
- `/api/items` - Item creation and management
- `/api/items/[id]/rating` - Individual item rating GET/PATCH operations
- `/api/items/filter` - Filter items by minimum rating
- `/api/settings` - Configuration management
- `/api/stash-graphql` - Proxy to Stash server GraphQL

### Docker Deployment
- Multi-stage build with Prisma generation before Next.js build
- Production database at `/data/prod.db` (mounted volume)
- Automatic migration deployment and seeding via `entrypoint.sh`
- Port 3000 exposed

### Smart Playlist Logic
Located in `src/lib/smartPlaylistServer.ts:buildItemsForPlaylist()`:
- Queries Stash for scene markers matching actor/tag conditions
- Applies rating filters (minimum rating threshold) by checking database
- Creates video clips with configurable before/after timing around markers
- Generates deduped titles combining scene and marker names
- Provides preview, screenshot, and stream URLs with API key authentication

### Rating System
Comprehensive 1-5 star rating system for markers/items:
- **Database**: `rating` field in Item table (nullable integer)
- **UI Component**: `src/components/StarRating.tsx` - Interactive star rating with MUI Joy
- **Scene Management**: Rate markers directly on `/scenes/[id]` page
- **Playlist Player**: Real-time rating of currently playing clips with auto-save
- **Smart Playlist Integration**: Filter by minimum rating in rule builder
- **Auto-creation**: Items are created automatically when rating non-existent markers
- **API**: Full CRUD operations for ratings with validation and error handling

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
- **Responsive Layout**: Clean JoyUI header design with search and sort controls that stack on mobile
- **Visual Feedback**: Proper loading states, empty states, and search result indicators
- **Performance Optimized**: Uses useMemo for efficient filtering and sorting operations