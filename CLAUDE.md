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
- Smart playlists: Auto-generated based on actor/tag conditions with configurable clip timing
- Items represent video segments with start/end times, screenshots, and stream URLs

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
- Creates video clips with configurable before/after timing around markers
- Generates deduped titles combining scene and marker names
- Provides preview, screenshot, and stream URLs with API key authentication