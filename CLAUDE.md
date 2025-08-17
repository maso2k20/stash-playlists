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

**User Interface:**
- `src/app/layout.tsx` - Modern navigation bar with Material-UI icons and hover effects
- Clean navigation design with Home, Playlists, Actors, and Settings (cog icon)
- Responsive layout with smooth transitions and theme compatibility

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
- **Enhanced Tag Context**: `src/context/StashTagsContext.tsx` with comprehensive tag data including `child_count` and nested children for smart recommendations
- **Tag Refresh**: Manual refresh buttons available on scene editing and actor scenes pages to reload tags from Stash server without app restart

**State Management:**
- `src/app/context/SettingsContext.tsx` - Global settings context
- `src/components/ApolloProvider.tsx` - GraphQL client provider
- `src/components/MarkerTagEditor.tsx` - Reusable tag editing component with compact mode

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
- Runs as non-root `nextjs` user (UID 1001) with proper file permissions for Next.js cache directories

### Smart Playlist Logic
Located in `src/lib/smartPlaylistServer.ts:buildItemsForPlaylist()`:
- Queries Stash for scene markers matching actor/tag conditions
- **Consistent Rating Filters**: Ensures items exist in database before applying rating filters
  - Creates missing items with null ratings for unrated markers
  - Only includes items with explicit ratings >= minimum threshold
  - Maintains consistency between editor preview and refresh operations
  - Uses concurrent database operations for optimal performance
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

### Scene Marker Management System
Enhanced marker editing and tagging interface on `/scenes/[id]` pages:
- **Performer Display**: Scene performers shown as highlighted chips in header for immediate context
- **Inline Marker Editing**: Create, edit, and delete markers with real-time validation
- **Tag Management**: Primary tag and additional tags with autocomplete selection
- **Time Controls**: Video player integration with jump-to-time and set-time-from-player functionality
- **Enhanced Video Player**: Custom VideoJS implementation with timeline markers that preserve normal seeking behavior:
  - Visual marker indicators on timeline for reference
  - Hover tooltips showing marker names and information
  - Non-intrusive markers that don't interfere with timeline seeking
  - Range indicators for markers with duration
  - VTT thumbnails integration for video preview
  - **30-Second Skip Controls**: Custom rewind/fast-forward buttons in control bar
    - Backward 30s button with counterclockwise arrow icon
    - Forward 30s button with clockwise arrow icon  
    - Positioned after play button for optimal UX
    - Respects video boundaries (won't skip before start or beyond end)
  - **Keyboard Shortcuts**: Page-level video navigation shortcuts
    - Left/Right arrow keys: Skip backward/forward 5 seconds
    - J/L keys: Skip backward/forward 10 seconds (YouTube-style)
    - Only active when not typing in input fields
  - **Enhanced Volume Control**: Compact mute button with horizontal volume popup
    - Volume button positioned after skip controls in control bar
    - Hover-activated horizontal volume slider popup
    - Timer display repositioned after progress bar for better layout
    - Clean popup design with proper hover area to prevent flickering
  - **Active Marker Highlighting**: Real-time visual feedback for closest marker to current timeline position
    - Timeline markers highlight in bright blue when closest to playback position
    - Marker cards show subtle blue outline for active marker with "● Active" chip
    - Automatic updates during timeline scrubbing and video playback
    - Throttled performance optimization (~10fps) for smooth operation
- **Rating Integration**: Rate markers directly in the editing interface with auto-save
- **Back Navigation**: Smart back button that returns to referrer page (actors page) preserving filter state
- **Common Tags**: Bulk add/remove arbitrary tags to all markers with toggle for add/remove mode
- **Performer Tags**: Pre-populated with all performer tags, allowing bulk application to markers:
  - Auto-populated from scene performers with deduplication
  - Remove-only interface (cannot add arbitrary tags)
  - Bulk apply/remove to all markers with mode toggle
  - Reset functionality to restore full performer tag list
- **Bulk Operations**: Save All, Reset All functionality for efficient marker management
  - Concurrent save operations using Promise.all() for improved performance
  - Parallel execution of create and update operations reduces total save time
  - Apollo cache updates maintained for each operation to ensure UI consistency
- **Auto-tagging**: Automatically adds "Markers Organised" tag to scene when markers are saved
- **Draft System**: Changes tracked as drafts with unsaved indicators and individual save/reset options
- **Chronological Ordering**: Markers automatically sorted by timestamp in editing interface
  - New markers placed in correct chronological position based on start time
  - Real-time reordering when marker times are modified
  - Mixed sorting of both existing and new markers for intuitive workflow
- **Primary Tag Validation**: Prevents saving markers without primary tags:
  - Bulk Save All blocked with alert if any markers lack primary tags
  - Save All button styled red when any markers missing primary tags
  - Visual feedback on required primary tag autocomplete field
  - Preserves all edits when save is blocked (no page reload/data loss)
- **Time Validation**: Comprehensive validation for marker timing:
  - Prevents saving markers without both start and end times
  - Validates that end time is after start time
  - Applies to both individual saves and bulk Save All operations
  - Clear error messages guide users to fix timing issues
- **Draft State Preservation**: Robust draft state management ensures unsaved changes to markers are preserved when deleting other markers:
  - Uses explicit object copying instead of destructuring to prevent React state batching issues
  - Maintains all unsaved edits when performing delete operations on other markers
  - Applies to both temporary markers and existing markers being deleted
  - Optimized to prevent video reloads during marker save operations
- **Sticky Video Player**: Video player remains visible when scrolling through long marker lists:
  - Uses CSS `position: sticky` on desktop screens (md+ breakpoints)
  - Maintains video playback state during marker editing workflow
  - Enhanced with subtle shadow and rounded corners when sticky
  - Mobile devices use normal layout to avoid screen space conflicts
- **Tag Recommendations**: Smart tag suggestions based on primary tag relationships:
  - **Primary Tag Suggestions**: Shows tags with children as green "Recommended" chips when no primary tag is selected
    - Helps users discover parent category tags quickly
    - Only displays when primary tag field is empty
    - One-click selection sets both primary tag and includes in tag collection
  - **Child Tag Recommendations**: Shows child tags of selected primary tag as blue clickable chips
    - Automatically filters out already selected tags
    - One-click addition to marker's tag collection
    - Only appears when primary tag has children and recommendations are available
  - Clean JoyUI chip design with hover effects and consistent styling
- **Tag Refresh Button**: "Refresh Tags" button in page header allows manual reload of tag data from Stash server to update recommendations without restarting the application

### Playlist Player Features
Enhanced playlist playbook experience at `/playlists/[id]`:
- **Current Item Display**: Shows title and rating component below video player
- **Real-time Rating**: Star rating component with immediate persistence via API
- **Marker Tag Editing**: Complete tag editing system integrated into playlist player:
  - **In-line Tag Editor**: Edit primary tags and additional tags directly while playing
  - **Tag Recommendations**: Smart tag suggestions based on primary tag children relationships
  - **Auto-save**: Tag changes persist immediately with Apollo cache updates
  - **Non-disruptive**: Video continues playing seamlessly during tag edits (React.memo optimized)
  - **Reusable Component**: `src/components/MarkerTagEditor.tsx` with compact layout mode
- **Auto-play**: Clicking playlist items automatically starts video playback
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
- **Expanded Layout**: Three-column grid layout with increased page width (1600px) for better space utilization
- **Playback Controls**: Direct play and shuffle buttons on each playlist card:
  - Play button (▶️) for normal sequential playback
  - Shuffle button (🔀) for randomized playback order
  - URL-based shuffle state via `?shuffle=true` parameter
- **Smart Playlist Refresh Feedback**: Clear visual indicators when refreshing smart playlists:
  - Prominent "Refreshing..." chip with spinning icon appears in stats row
  - Warning color and text provide immediate feedback during refresh operations
  - Complements existing dimmed refresh button for comprehensive user feedback
- **Automatic Smart Playlist Refresh**: Scheduled refresh system to keep playlists synchronized:
  - Configurable refresh intervals: hourly, daily, or weekly schedules
  - Settings integration with scheduler restart on configuration changes
  - Manual bulk refresh button on playlists page for immediate updates
  - Refresh status display in settings showing schedule and last/next refresh times
  - Background cron service using node-cron for reliable scheduling
  - Comprehensive error handling and status reporting for refresh operations
  - **Refresh Confirmation & Logging**: Complete audit trail for refresh operations:
    - Persistent database logging via RefreshLog table tracking all refresh attempts
    - Settings page displays recent refresh history with success/failure status
    - Detailed logging shows refresh type (manual/scheduled), duration, and error details
    - Real-time status indicators during refresh operations
    - API endpoints for programmatic access to refresh status and history
- **Responsive Layout**: Clean JoyUI header design with search and sort controls that stack on mobile
- **Visual Feedback**: Proper loading states, empty states, and search result indicators
- **Performance Optimized**: Uses useMemo for efficient filtering and sorting operations

### Global Scenes Browser
Comprehensive scene browsing and navigation at `/scenes` with advanced filtering and sorting:
- **Navigation Integration**: Added "Scenes" menu item in main navigation between Playlists and Actors
- **Dual-Query Architecture**: Intelligent query selection for optimal performance:
  - `GET_SCENES_PAGINATED`: Fast paginated browsing (42 scenes/page) for initial load
  - `GET_SCENES_FILTERED`: Comprehensive filtering with `per_page: -1` for search across all results
- **Advanced Filtering System**: Multi-criteria filtering with real-time updates:
  - **Title Search**: Text-based scene title filtering with instant results
  - **Performer Filter**: Multi-select performer dropdown with alphabetical sorting and aggressive caching
  - **Tag Filter**: Multi-select tag filtering using Stash tag context
  - **Rating Filter**: Filter by minimum star rating (1+ to 5 stars)
- **Performance Optimizations**: 
  - Apollo Client `cache-first` policy for performer data with `notifyOnNetworkStatusChange: false`
  - Memoized calculations for performer/tag options and selections
  - Server-side sorting of performers by name in GraphQL query
- **URL State Persistence**: All filters, sorting, and pagination state preserved in URL parameters
- **Smart Pagination**: Pagination controls only displayed when browsing (not filtering)
- **Rating Integration**: Visual star rating display on scene cards using `rating100` field conversion
- **Scene Navigation**: Click any scene card to navigate to `/scenes/[id]` for marker editing
- **Responsive Design**: Clean JoyUI layout with proper loading states, empty states, and error handling
- **GraphQL Integration**: Uses Stash proxy endpoint `/api/stash-graphql` with proper error handling and debug logging

### Actor Browsing System
Enhanced marker browsing and selection on `/actors/[id]` pages with dual-query pagination system:
- **Dual-Query Performance**: Automatic switching between paginated browsing (42 items/page) and comprehensive filtering
- **Pagination System**: Direct GraphQL queries with proper pagination controls:
  - Uses Apollo Client `useQuery` with dynamic query selection for optimal performance
  - Proper pagination boundaries prevent navigation to empty pages
- **Pagination Controls**: Top and bottom pagination with page number chips for easy navigation
- **Advanced Filtering**: Multi-select tag filtering with real-time search across marker titles
- **Context-Aware Sorting**: Sorting only available during filtering (not pagination) for better UX
- **URL Persistence**: All state (page, tags, search, sort) persisted in URL query parameters
- **Performance Optimization**: 
  - Paginated load: 42 cards per page for fast rendering
  - Direct GraphQL queries with Apollo Client caching
  - Efficient ratings fetching per page
- **Direct Navigation**: Click any marker card to navigate to scene editing page for that marker's scene
- **Individual Playlist Addition**: Plus button on each marker card opens dialog to add single marker to playlists
- **Rating Display**: Shows existing star ratings for previously rated markers via bulk API lookup
- **Smart Empty States**: Different messages for no data vs filtered results with quick clear actions
- **Tag Refresh Button**: "Refresh Tags" button in filter controls to reload tag data from Stash server without app restart

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
- **Categorized UI**: Settings grouped by category (Stash Integration, Appearance, Playback, Database Backup) with accordion layout
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
  - `BACKUP_ENABLED`: "true" (enable automatic daily backups)
  - `BACKUP_RETENTION_DAYS`: "7" (days to keep backups, 1-365)
  - `BACKUP_HOUR`: "2" (hour to run backups, 0-23 UTC)

### Database Backup System
Automated backup solution with scheduled and manual backup capabilities:
- **Automated Backups**: Daily scheduled backups using node-cron at configurable time
- **Manual Backups**: On-demand backup creation via settings page interface
- **Backup Management**: List, delete, and restore from backup files with confirmation dialogs
- **Retention Policy**: Configurable retention period with automatic cleanup of old backups
- **Storage Locations**: 
  - Development: `./backups/` directory in project root
  - Production: `/data/backups/` for persistent Docker storage
- **Backup Format**: SQLite VACUUM INTO creates compact, clean database copies using Prisma for connection pooling
- **Safety Features**: Creates backup of current database before restore operations
- **API Endpoints**: `/api/backup` with actions for create, delete, restore, cleanup, update-schedule
- **Settings Integration**: Complete backup controls integrated into settings page with status display
- **Initialization**: Backup service automatically starts with application via `AppInitializer` component
- **Environment Aware**: Automatically detects development vs production database paths
- **Error Handling**: Comprehensive error handling with user-friendly feedback messages
- **Database Compatibility**: Uses Prisma's `$executeRaw` instead of direct SQLite connections to prevent locking conflicts in production

