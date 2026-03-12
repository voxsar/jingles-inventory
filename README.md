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

## Tech Stack

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
