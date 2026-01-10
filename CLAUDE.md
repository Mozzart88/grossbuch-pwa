# GrossBuch - Personal Expense Tracker PWA

## Project Overview

A mobile-first Progressive Web App for personal expense and income tracking with full offline support. Data persists locally using SQLite WASM with OPFS (Origin Private File System).

**Key Features:**

- Transaction management (income, expense, transfer, exchange)
- Multi-currency support with exchange rate tracking
- Account balance tracking
- Category and counterparty management
- CSV export
- Offline-first architecture

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI | React 19.2 + TypeScript |
| Styling | Tailwind CSS 4.x |
| Build | Vite 7.x |
| Database | SQLite WASM (@sqlite.org/sqlite-wasm) |
| Storage | OPFS (browser file system) |
| PWA | vite-plugin-pwa + Workbox |
| Routing | react-router-dom 7.x |

## Project Structure

```
src/
├── components/
│   ├── ui/              # Reusable primitives (Button, Input, Modal, etc.)
│   ├── layout/          # App shell (AppLayout, PageHeader)
│   ├── transactions/    # Transaction feature components
│   ├── accounts/        # Account management components
│   ├── categories/      # Category management components
│   ├── counterparties/  # Counterparty components
│   └── currencies/      # Currency components
├── pages/               # Route-level page components
├── services/
│   ├── database/        # SQLite connection, migrations, worker
│   ├── repositories/    # Data access layer (one per entity)
│   └── export/          # CSV export service
├── store/               # React Context providers
├── types/               # TypeScript interfaces
└── utils/               # Helper functions (dates, formatters)
```

## Key Files

| Purpose | File |
|---------|------|
| App entry & context hierarchy | `src/App.tsx:64-76` |
| Database schema | `src/services/database/migrations.ts:5-116` |
| Type definitions | `src/types/index.ts` |
| SQLite worker | `src/services/database/worker.ts` |
| PWA & COOP/COEP config | `vite.config.ts:10-89` |

## Commands

```bash
npm run dev      # Start dev server with HMR
npm run build    # TypeScript check + production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## Database Entities

| Entity | Purpose |
|--------|---------|
| currencies | Currency definitions (USD, EUR, etc.) |
| accounts | User's bank accounts/wallets |
| categories | Income/expense categories |
| counterparties | Vendors, employers, etc. |
| transactions | All financial transactions |
| settings | App configuration |

## Transaction Types

- **income** - Money received (requires category)
- **expense** - Money spent (requires category)
- **transfer** - Move between accounts (same currency)
- **exchange** - Convert between currencies (stores rate)

## Important Constraints

1. **COOP/COEP Headers Required**: SQLite WASM with OPFS needs cross-origin isolation. See `vite.config.ts:74-89`

2. **Delete Protection**: Categories and counterparties cannot be deleted if linked to transactions

3. **Datetime Storage**: Stored as local time strings `YYYY-MM-DD HH:MM:SS` (not UTC). See `src/utils/dateUtils.ts`

4. **SQLite in Worker**: All database operations run in a Web Worker for non-blocking UI. See `src/services/database/worker.ts`

## Verification Checklist

- [ ] Database persists after page reload (OPFS working)
- [ ] All 4 transaction types create correctly
- [ ] Account balances calculate correctly
- [ ] App works offline (disconnect network)
- [ ] PWA installable on mobile

## Adding New Features and Fixing Bugs

**IMPORTANT** : When you work on a new feature or bug, create a git branch first.
Then work on changes in that branch for the remainder of the session.

## Additional Documentation

When working on specific areas, check these files:

| Topic | File |
|-------|------|
| Architectural patterns & conventions | `.claude/docs/architectural_patterns.md` |
