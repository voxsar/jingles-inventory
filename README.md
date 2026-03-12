# 🎵 Jingles Inventory Management System

A comprehensive, full-stack inventory management application built as a monorepo with npm workspaces.

## Architecture

```
jingles-inventory/
├── packages/
│   ├── shared/         # TypeScript types, enums, interfaces
│   ├── backend/        # Express + Prisma REST API
│   ├── web/            # React + Vite web frontend
│   └── electron/       # Electron desktop app
└── package.json        # npm workspaces root
```

## Testing

This project uses a **TDD-first approach** with [Vitest](https://vitest.dev/) as the test runner across all packages.

### Quick Start — Run All Tests

```bash
# Install dependencies
npm install

# Run all tests across all packages
npm test

# Run tests for individual packages
npm run test:shared     # Shared types/enums/transitions
npm run test:backend    # Backend unit + integration tests
npm run test:web        # React component tests
npm run test:electron   # Electron scanner + sync tests

# Run with coverage
npm run test:coverage
```

### Test Structure

```
packages/
  shared/src/__tests__/
    enums.test.ts            # Enum completeness and values
    transitions.test.ts      # State machine transition rules
  backend/src/__tests__/
    unit/
      unitConverter.test.ts  # Box/piece/weight/volume conversion
      spaceEngine.test.ts    # Volume, capacity, stacking validation
      ocrProcessor.test.ts   # Invoice OCR text parsing
      vendorService.test.ts  # Vendor access filter
      grnService.test.ts     # GRN create/submit/inspect workflows
      eventLedger.test.ts    # Append-only event recording
      stateMachine.test.ts   # Inventory state transitions (with DB mock)
    integration/
      api.test.ts            # HTTP API routes via supertest
    mocks/
      prismaMock.ts          # Prisma client mock for unit tests
      hardwareMocks.ts       # Barcode scanner + OCR mock adapters
    fixtures/
      testData.ts            # Seed fixtures (users, SKUs, GRNs, events)
  web/src/__tests__/
    components/
      StateBadge.test.tsx    # State badge color rendering
      BarcodeInput.test.tsx  # Barcode scan input component
      ProtectedRoute.test.tsx # RBAC-protected route rendering
  electron/src/__tests__/
    scanner.test.ts          # Keyboard wedge scanner logic
    syncEngine.test.ts       # Offline sync and conflict handling
```

### Test Coverage

| Package | Tests | Areas |
|---------|-------|-------|
| `shared` | 41 | All enums, all state transitions, override rules |
| `backend` | 105 | Unit converter, space engine, OCR, GRN workflow, event ledger, state machine, API routes |
| `web` | 34 | StateBadge, BarcodeInput, ProtectedRoute with all roles |
| `electron` | 22 | Keyboard wedge scanner, sync push/pull/conflict |
| **Total** | **202** | |

### Mock Strategy

- **Prisma**: Mocked via `vi.mock('../../prisma/client')` — no database required for unit tests
- **Barcode Scanner**: Mock keyboard-wedge event injector in `hardwareMocks.ts`
- **OCR**: Mock payload factory in `hardwareMocks.ts` with valid/partial/malformed invoices
- **Axios (Electron sync)**: Mocked to simulate server push/pull responses and network errors
- **@testing-library/react**: Component tests with jsdom + mocked API client

### Run Tests in Docker (No Local DB Required)

```bash
# Run all tests in Docker
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

### CI Pipeline

GitHub Actions runs on every push and PR:
1. **Shared tests** — pure TypeScript, no dependencies
2. **Backend tests** — unit tests with mocked Prisma (no DB)
3. **Web tests** — React component tests with jsdom
4. **Electron tests** — unit tests for scanner and sync logic
5. **Build verification** — ensures all packages compile
6. **Integration tests** — with real PostgreSQL service container

### Local VM Verification

```bash
# 1. Clone and install
git clone https://github.com/voxsar/jingles-inventory.git
cd jingles-inventory
npm install

# 2. Run all unit tests (no DB needed)
npm test

# 3. Start local dev environment with Docker
docker-compose up -d

# 4. Run database migrations and seed
cd packages/backend
cp .env.example .env   # Edit DATABASE_URL if needed
npx prisma migrate dev
npm run prisma:seed

# 5. Start development servers
npm run dev:backend   # Port 3001
npm run dev:web       # Port 5173
```

### Business Rules Verified by Tests

| Rule | Test File |
|------|-----------|
| All 8 inventory state values exist | `enums.test.ts` |
| All 9 event types exist | `enums.test.ts` |
| Valid state transitions allowed | `transitions.test.ts` |
| Invalid transitions rejected for Staff | `transitions.test.ts`, `stateMachine.test.ts` |
| Manager/Admin can override invalid transitions | `transitions.test.ts`, `stateMachine.test.ts` |
| Override flag set on event record | `stateMachine.test.ts` |
| Events cannot be deleted (no delete mock) | `eventLedger.test.ts` |
| GRN rejects duplicate invoice reference | `grnService.test.ts` |
| GRN rejects duplicate SKU lines | `grnService.test.ts` |
| Submission creates Uninspected inventory | `grnService.test.ts` |
| Rejected items auto-transition to Damaged | `grnService.test.ts` |
| GRN status updates to FullyInspected | `grnService.test.ts` |
| Box→Piece conversion ratio (1:12 default) | `unitConverter.test.ts` |
| Custom conversion rules take precedence | `unitConverter.test.ts` |
| Volume calculated from dimensions | `spaceEngine.test.ts` |
| Stacking height limits enforced | `spaceEngine.test.ts` |
| Fragile item stacking validation | `spaceEngine.test.ts` |
| Vendor filter scopes to own products | `vendorService.test.ts` |
| Admin/Manager not restricted by vendor filter | `vendorService.test.ts` |
| OCR extracts invoice fields from text | `ocrProcessor.test.ts` |
| Barcode scanner buffers keystrokes | `scanner.test.ts` |
| Scanner resets buffer after timeout | `scanner.test.ts` |
| Sync push queues operations | `syncEngine.test.ts` |
| Sync conflict detection | `syncEngine.test.ts` |
| Protected routes redirect unauthenticated users | `ProtectedRoute.test.tsx` |
| Role-based access control in routes | `ProtectedRoute.test.tsx` |



| Package | Technologies |
|---------|-------------|
| **shared** | TypeScript, enums, interfaces, state machine rules |
| **backend** | Node.js, Express, TypeScript, Prisma ORM, PostgreSQL, JWT, bcryptjs |
| **web** | React 18, TypeScript, Vite, TailwindCSS, Zustand, Axios, React Router v6 |
| **electron** | Electron, better-sqlite3, TypeScript, React 18 |

## Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL 14+

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Database

```sql
CREATE DATABASE jingles_inventory;
```

### 3. Configure Backend

```bash
cd packages/backend
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET
```

### 4. Run Prisma Migrations

```bash
cd packages/backend
npm run prisma:migrate
npm run prisma:seed
```

Default admin credentials after seed:
- **Email**: `admin@jingles.com`
- **Password**: `admin123`

### 5. Start Development

**Backend** (port 3001):
```bash
npm run dev:backend
```

**Web Frontend** (port 5173):
```bash
npm run dev:web
```

**Electron Desktop App**:
```bash
npm run dev:electron
```

## Domain Model

### Inventory States

```
UnopenedBox → Uninspected → Inspected → ShelfReady → Reserved → Sold
                                ↑                              ↓
                             Returned ←──────────────────────┘

Any state → Damaged (terminal)
```

### State Transition Rules

| From | To | Role Required |
|------|-----|--------------|
| UnopenedBox | Uninspected | Staff+ |
| Uninspected | Inspected | Inspector+ |
| Inspected | ShelfReady | Staff+ |
| ShelfReady | Reserved | Staff+ |
| Reserved | Sold | Staff+ |
| Sold | Returned | Staff+ |
| Any | Damaged | Staff+ |
| Invalid transition | Any | Manager/Admin (override with logging) |

## API Reference

### Authentication
```
POST /api/auth/login        - Login, returns JWT token
GET  /api/auth/me           - Get current user profile
```

### SKUs
```
GET    /api/skus            - List SKUs (filterable)
POST   /api/skus            - Create SKU
GET    /api/skus/:id        - Get SKU details
PUT    /api/skus/:id        - Update SKU
```

### Inventory
```
GET    /api/inventory                 - List inventory records (filter by state, skuId, locationId)
POST   /api/inventory                 - Create inventory record
POST   /api/inventory/:id/transition  - State transition
POST   /api/inventory/box-open        - Open box → create piece records
GET    /api/inventory/events          - Audit event log (append-only)
```

### GRN Workflow
```
GET    /api/grns                - List GRNs
POST   /api/grns                - Create draft GRN
GET    /api/grns/:id            - Get GRN with lines and inspections
PUT    /api/grns/:id/submit     - Submit GRN (creates Uninspected inventory)
POST   /api/grns/:id/inspect    - Submit inspection (creates Inspected/Damaged records)
```

### Locations
```
GET    /api/locations       - List locations
POST   /api/locations       - Create location
```

### Vendors
```
GET    /api/vendors                  - List vendors (Admin only)
GET    /api/vendors/:id/products     - Vendor's products
```

### Reports
```
GET    /api/reports/inventory-valuation  - Inventory valuation by SKU
GET    /api/reports/floor-performance    - Floor-wise storage performance
GET    /api/reports/sales-summary        - Sales summary
```

### OCR & Barcode
```
POST   /api/ocr/invoice     - Upload invoice image for OCR
POST   /api/barcode/scan    - Scan barcode, returns SKU + inventory
```

### Space Management
```
GET    /api/space/calculate             - Calculate floor usage %
GET    /api/space/stacking-suggestions  - Get stacking suggestions
```

### Offline Sync
```
POST   /api/sync/push       - Push offline changes to server
GET    /api/sync/pull       - Pull server changes to client
```

## Role-Based Access Control

| Role | Permissions |
|------|-------------|
| **Admin** | Full access, user management |
| **Manager** | All operations + override invalid state transitions |
| **Staff** | Create/update inventory, GRNs, scan barcodes |
| **Inspector** | Submit inspection records |
| **Vendor** | View own products and inventory only |

## Key Features

### 1. State Machine
- Strict state transition enforcement
- Manager/Admin override with mandatory logging
- Append-only event ledger (no delete/update)

### 2. GRN Workflow
1. Create Draft GRN with lines
2. Submit GRN → creates `Uninspected` inventory records
3. Inspect each line → creates `Inspected` and/or `Damaged` records
4. GRN auto-transitions to PartiallyInspected/FullyInspected

### 3. Box-to-Piece Conversion
- Open a box → decrement box quantity, create piece records
- Uses SKU conversion rules (default: 1 box = 12 pieces)
- Custom conversion rules per SKU via JSON config

### 4. Vendor Isolation
- Vendor role users are automatically filtered to see only their vendor's data
- Applied at query level across all endpoints

### 5. Offline-First (Electron)
- All data cached in SQLite (better-sqlite3)
- Operations queued when offline
- Automatic sync when connection restored
- Conflict detection with version checking
- Conflicts flagged for Manager review

### 6. Space Management
- Calculate cubic volume from SKU dimensions
- Floor/shelf capacity usage percentage
- Stacking rules: fragile items, max stack height, heavy-on-bottom

## Development Guide

### Project Structure

```
packages/backend/src/
├── middleware/
│   ├── auth.ts          # JWT authentication + requireRole()
│   └── errorHandler.ts  # Global error handling
├── modules/
│   ├── analytics/       # Reports and analytics
│   ├── barcode/         # Barcode scanning
│   ├── conversion/      # Unit conversion
│   ├── grn/             # GRN workflow
│   ├── inventory/       # State machine + event ledger
│   ├── ocr/             # Invoice OCR
│   ├── space/           # Storage space engine
│   └── vendor/          # Vendor isolation
├── prisma/
│   ├── client.ts        # Singleton PrismaClient
│   └── seed.ts          # Database seeder
├── routes/              # Express route handlers
└── server.ts            # Express app entry point
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `JWT_SECRET` | JWT signing secret | required |
| `JWT_EXPIRES_IN` | Token expiry | `7d` |
| `PORT` | Server port | `3001` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |

### Building for Production

```bash
# Build all packages
npm run build

# Build Electron distributable
cd packages/electron
npm run build:electron
```

### Database Seeding

The seed script creates:
- 1 Admin user (admin@jingles.com / admin123)
- 1 Manager user (manager@jingles.com / manager123)
- 1 sample Vendor
- 1 sample SKU

## Security Notes

- JWT tokens stored in localStorage (consider httpOnly cookies for production)
- All API routes require authentication except POST /api/auth/login
- Vendor users are isolated to their vendor_id at the query level
- Event ledger is append-only (no DELETE routes)
- Audit logs capture all mutations with user, IP, and timestamp
- Rate limiting: 200 requests per 15 minutes per IP

## License

MIT
