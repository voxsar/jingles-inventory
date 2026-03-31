# Dashboard Performance Optimization - Summary

## Problem
The dashboard was loading slowly because it fetched all inventory records (up to 1000) and GRN records (up to 100) on every page load, then calculated counts client-side.

## Solution
Implemented a cached dashboard statistics system that:
1. Stores pre-calculated counts in a dedicated `dashboard_stats` table
2. Updates automatically when inventory or GRN data changes (non-blocking)
3. Serves cached data via fast API endpoint `/api/dashboard/stats`

## Changes Made

### Backend

1. **Database Schema** (`packages/backend/prisma/schema.prisma`)
   - Added `DashboardStats` model with fields:
     - `totalItems`, `shelfReadyItems`, `damagedItems`, `openGRNs` (integers)
     - `inventoryByState` (JSON with per-state counts and quantities)
     - `lastUpdated` (timestamp)

2. **Migration** (`20260325091701_add_dashboard_stats/migration.sql`)
   - Created `dashboard_stats` table
   - Initialized with a singleton row

3. **Dashboard Service** (`src/modules/dashboard/dashboardService.ts`)
   - `refreshDashboardStats()` - Recalculates all stats from database
   - `getDashboardStats()` - Returns cached stats (auto-refreshes if missing)
   - `queueDashboardStatsRefresh()` - Non-blocking background refresh

4. **Auto-Update Hooks** - Added `queueDashboardStatsRefresh()` calls to:
   - `src/modules/inventory/stateMachine.ts` - After state transitions
   - `src/routes/inventory.ts` - After create, update, box-open operations
   - `src/modules/grn/grnService.ts` - After GRN create, submit, inspection

5. **API Endpoint** (`src/routes/dashboard.ts`)
   - `GET /api/dashboard/stats` - Returns cached statistics
   - `POST /api/dashboard/refresh` - Force refresh (for admin use)

6. **Server Registration** (`src/server.ts`)
   - Registered `/api/dashboard` route

### Frontend

1. **API Client** (`packages/web/src/api/client.ts`)
   - Added `dashboardApi.getStats()` and `dashboardApi.refreshStats()`

2. **Dashboard Page** (`packages/web/src/pages/DashboardPage.tsx`)
   - Changed from fetching 1000+ inventory + 100 GRN records
   - Now fetches single cached stats object
   - Parses `inventoryByState` JSON for the breakdown chart

## Performance Impact

**Before:**
- 2 API calls fetching ~1100 records total
- Client-side filtering and counting
- Slow initial load (especially with large datasets)

**After:**
- 1 API call returning a single stats record
- All calculations done once in background
- Near-instant dashboard load

## Initialization

Dashboard stats are automatically calculated on first access. For immediate initialization after deployment:

```bash
node scripts/init-dashboard-stats.mjs
```

## Maintenance

Stats refresh automatically in the background after any inventory/GRN change. No manual intervention needed. If stats ever become stale, admins can force refresh via `POST /api/dashboard/refresh`.
