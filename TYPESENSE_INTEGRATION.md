# Typesense Search Integration

## Overview

Typesense provides fast full-text search across SKUs, inventory records, and vendors. The system uses an **async sync pattern** with background jobs to handle large datasets without HTTP timeouts.

## Configuration

Add these environment variables to `/packages/backend/.env`:

```bash
TYPESENSE_HOST="typesense.artslabcreatives.com"
TYPESENSE_PORT="443"
TYPESENSE_PROTOCOL="https"
TYPESENSE_API_KEY="your-typesense-api-key"
```

## Collections

Three collections are created automatically:

1. **skus** - Product catalog
   - Searchable fields: name, skuCode, description, vendorName, categoryName
   - Filterable: vendorId, categoryId, isActive

2. **inventory** - Current inventory records
   - Searchable fields: skuName, skuCode, branchName, floorName, shelfName
   - Filterable: state, branchId, floorId, shelfId

3. **vendors** - Supplier information
   - Searchable fields: name, contactEmail, contactPhone

## Usage

### From Settings UI (Admin only)

Navigate to **Settings → Typesense Search Sync**:

1. **Test Connection** - Verify Typesense server is accessible
2. **Sync All** - Sync all three collections (recommended for initial setup)
3. **Recreate & Sync All** - Delete and recreate collections (use if schema changed)
4. **Individual Syncs** - Sync specific collections (SKUs, Inventory, or Vendors)

The UI polls for job status every 2 seconds and displays progress messages.

### Programmatically

```typescript
import { startSyncJob } from './modules/typesense/syncService';
import { getJob } from './modules/typesense/jobTracker';

// Start sync
const jobId = startSyncJob('skus'); // or 'inventory', 'vendors', undefined for all

// Check status
const job = getJob(jobId);
console.log(job.status, job.progress);
```

## API Endpoints

**Test Connection:**
```
GET /api/settings/typesense/test
```

**Start Sync Job:**
```
POST /api/settings/typesense/sync
Body: { entity?: 'skus' | 'inventory' | 'vendors', recreate?: boolean }
Response: { jobId: string }
```

**Get Job Status:**
```
GET /api/settings/typesense/jobs/:jobId
Response: { id, entity, status, progress, result, error, startedAt, completedAt }
```

**List All Jobs:**
```
GET /api/settings/typesense/jobs
```

## Architecture

- **Async Background Jobs**: Sync operations run in the background, avoiding HTTP timeouts
- **Batch Processing**: Large datasets are processed in 200-record batches
- **In-Memory Job Tracking**: Job status stored in memory (consider Redis for multi-instance deployments)
- **Auto-Cleanup**: Completed jobs are removed after 1 hour

## Scope: sync only

This module keeps Typesense collections in sync with Postgres. **Nothing in the
application queries Typesense.** Application search is served by Prisma
(`contains` / `ILIKE`) on the server, and by SQLite FTS5 (`skus_fts`) in the
Electron local-replica mode — see `packages/backend/src/utils/localSearch.ts`.

If you wire up query-side Typesense later, add routes alongside the sync
endpoints above and update this section. Until then the collections are written
but never read.

## Performance

- **Batch size**: 200 records per batch (configurable)
- **Timeout handling**: Jobs run async, no HTTP timeout issues
- **Progress tracking**: Real-time status updates via polling
- **Memory efficient**: Batched processing prevents memory exhaustion

## Troubleshooting

**504 Gateway Timeout**: Fixed by async job pattern. The sync now returns immediately with a job ID.

**Connection Failed**: Check TYPESENSE_API_KEY and network access to typesense.artslabcreatives.com

**Sync Stuck**: Check PM2 logs: `pm2 logs jingles-backend`

**Job History**: Jobs auto-cleanup after 1 hour. For persistent tracking, store job records in database.
