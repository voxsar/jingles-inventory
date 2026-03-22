# Jingles Inventory Management System

Full-stack TypeScript monorepo for inventory management with state machine-driven workflows, event sourcing, and offline-first Electron app.

## Architecture

**Monorepo structure:** npm workspaces with 4 packages:
- `@jingles/shared` - TypeScript types, enums, state machine (built first, imported by all)
- `packages/backend` - Express + Prisma REST API (layered: routes → services → Prisma)
- `packages/web` - React + Vite + Zustand frontend
- `packages/electron` - Offline-capable desktop app with sync engine

**State machine:** Central to inventory workflow. All changes go through `stateMachine.ts` → atomic state update + event log. Transitions defined in `@jingles/shared/transitions.ts`. Manager/Admin roles can override invalid transitions with `requiresOverride` flag.

**Event sourcing:** Append-only `inventoryEvent` table via `eventLedger.ts`. Every state change creates an immutable event record. Never delete events in tests or migrations.

## Build and Test

```bash
# Install and test (no database needed for most tests)
npm install
npm test                    # Run all 202+ tests across packages
npm run test:backend        # Backend unit + integration tests
npm run test:web            # React component tests

# Build (must build shared first)
npm run build:shared && npm run build

# Development
npm run dev:backend         # Port 3001
npm run dev:web             # Port 5173

# Database
cd packages/backend
npx prisma migrate deploy   # Deploy migrations (production)
npx prisma generate         # Regenerate Prisma Client after schema changes
npm run prisma:seed         # Seed test data
```

**TDD-first:** Write tests before implementation. See [README.md](../README.md#testing) for 202+ test examples.

## Database Migrations

**Laravel-style migration tracking:** Prisma migrations are tracked in `_prisma_migrations` table. Each migration has a timestamp and is applied once.

**Creating new migrations:**
1. Update `schema.prisma` with your schema changes
2. Generate migration SQL (review before applying):
   ```bash
   cd packages/backend
   npx prisma migrate diff \
     --from-schema-datasource prisma/schema.prisma \
     --to-schema-datamodel prisma/schema.prisma \
     --script > new_migration.sql
   ```
3. Create migration folder:
   ```bash
   TIMESTAMP=$(date +%Y%m%d%H%M%S)
   mkdir -p prisma/migrations/${TIMESTAMP}_your_description
   mv new_migration.sql prisma/migrations/${TIMESTAMP}_your_description/migration.sql
   ```
4. Apply migration:
   ```bash
   npx prisma migrate deploy    # Production (no shadow DB)
   # OR
   npx prisma migrate dev        # Development (requires shadow DB permissions)
   ```
5. Regenerate Prisma Client:
   ```bash
   npx prisma generate
   ```
6. Restart server:
   ```bash
   pm2 restart jingles-backend
   ```

**Production constraint:** No shadow database permissions, so always use `prisma migrate deploy` (not `migrate dev`).

**Checking migration status:**
```bash
npx prisma migrate status     # Shows pending/applied migrations
```

## Code Conventions

### Backend

**Prisma patterns:**
- UUIDs for all primary keys (`id String @id @default(uuid())`)
- Snake_case columns with `@map()` (e.g., `createdAt DateTime @map("created_at")`)
- Soft deletes via `isActive` boolean
- Transactions for state changes: `prisma.$transaction([updateState, createEvent])`
- Reference: [schema.prisma](../packages/backend/prisma/schema.prisma)

**Module architecture:**
- Domain modules in `src/modules/` (e.g., `inventory/`, `grn/`, `vendor/`)
- Each module has service files (business logic)
- Routes in `src/routes/` call services
- Auth middleware chains: `authenticate()` then `requireRole(['Admin', 'Manager'])`

**Testing:**
- Mock Prisma globally in [__tests__/setup.ts](../packages/backend/src/__tests__/setup.ts)
- Use fixtures from [testData.ts](../packages/backend/src/__tests__/fixtures/testData.ts)
- Reset mocks in `beforeEach(() => resetPrismaMocks())`
- Integration tests use supertest for API routes

### Frontend (Web)

**Component patterns:**
- Functional components with TypeScript interfaces for props
- Generic components: `DataTable<T>` for type-safe reusable tables
- Controlled inputs with `useState`
- Emoji icons (📦, 🎵, 📊) instead of icon libraries

**State & API:**
- Zustand store for auth only (`authStore.ts`)
- Local state for everything else
- Axios instance with auto-attached JWT Bearer token
- 401 responses trigger automatic logout
- API organized by domain: `authApi`, `skusApi`, `inventoryApi`

**Routing:**
- `ProtectedRoute` HOC for auth + role-based access
- `roles` prop limits access by `UserRole` enum

**Styling:**
- Tailwind utility-first classes
- Use `clsx()` for conditional classes
- Extended theme colors in `tailwind.config.js`

### Shared Package

**Import from `@jingles/shared`:**
```typescript
import { InventoryState, UserRole, IInventoryRecord } from '@jingles/shared';
```

**Conventions:**
- Enums for all constants (11 enums total)
- Interfaces prefixed with `I` (e.g., `IUser`, `ISKU`)
- State transitions exported from `transitions.ts`
- Always validate transitions with `validateTransition()` before state changes

## Common Pitfalls

1. **State machine bypass:** Never update `state` field directly in Prisma—always use `stateMachine.performTransition()` to ensure event logging.

2. **Build order:** `@jingles/shared` must build before other packages. Run `npm run build:shared` first.

3. **Test isolation:** Use `vi.clearAllMocks()` in `beforeEach` to prevent test pollution. Mock Prisma for unit tests.

4. **Vendor role filtering:** Vendor users must see only their products. Apply `vendorId` filter in service layer, not routes.

5. **Event immutability:** Never provide `delete` operations in event ledger mocks—events are append-only.

6. **Override flag:** When Manager/Admin forces invalid transition, set `requiresOverride: true` on the event record.

## Project Specifics

- **Database:** PostgreSQL 14+ required for backend
- **Deployment:** Docker Compose with `docker-compose.yml` for dev; production uses PM2
- **Migrations:** Laravel-style tracking via `_prisma_migrations` table in `packages/backend/prisma/migrations/`. Use `migrate deploy` in production (no shadow DB access).
- **Logging:** Winston logger in `packages/backend/src/utils/logger.ts`
- **Authentication:** JWT with 7-day expiry, bcrypt password hashing
