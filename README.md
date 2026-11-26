# MediCare ERP — Pharmacy Supply Chain & Inventory System

Internal ERP for a Central Warehouse and multiple branches. No customer-facing POS, no barcode
scanners — every dispensation is recorded manually through a searchable batch interface.

> Runtime note: this workspace runs on **Next.js (App Router) + PostgreSQL + Drizzle ORM**.
> The Express/Mongoose API layer is implemented with Next.js route handlers (`src/app/api/**`) and
> the React SPA is implemented with App Router client pages. All business rules, RBAC, JWT auth,
> seed data and cron automation from the MERN specification are preserved.

## Demo accounts (password `password123`)

| Role | Email | Password | Scope |
| --- | --- | --- | --- |
| Central Admin | `nelkasehan@gmail.com` | `nelka123` | Global (warehouse + branches) |

Additional users are created by the administrator in **Users & roles** (or **Branches → Staff**)
and each branch-scoped account must be assigned a location.

The login screen also provides **one-click demo login** for every role.

## Key modules

- **Dashboards** — role-scoped KPIs, Recharts stock/velocity/dispensing charts, STV pipeline, expiry watchlist, reorder risks, redistribution suggestions.
- **Inventory** — batch-level stock with 3-tier expiry badges, lock state, search/filter/pagination, CSV export, warehouse stock receipt (`POST /api/batches`).
- **Indents** — branch/pharmacist creation → central approval with per-line approved quantities or rejection reason → FEFO pick list.
- **Transfer vouchers (STV)** — `Created → Picking → Packed & Verified → In-Transit → Delivered → GRN Posted`, plus `Delivery Exception`, `Rejected / Quarantined`, `Cancelled`. Source stock leaves on dispatch; destination stock only increases on GRN posting.
- **Inter-branch sharing** — offer slow movers / request surplus, central approval auto-creates the source STV with FEFO allocation, destination posts GRN.
- **Expiry alert centre** — yellow (<180d), orange (<90d), red (<30d) and expired tiers. Red locks dispatch/transfers but allows local dispensing with confirmation; expired is fully locked and quarantined.
- **Stock-out & EOD** — manual searchable batch dispensing (expired disabled), near-expiry confirmation modal, EOD summary and reconciliation.
- **Expired returns** — branch raises a return, warehouse receives and disposes; quantities quarantined throughout.
- **Administration** — product/UOM master and user/role management (Central Admin only).
- **Automation** — `node-cron` (registered in `src/instrumentation.ts`) runs a daily 02:00 PKT scan plus hourly expiry sweep; admins can trigger a scan from the alert centre.

## Architecture

```
src/
  app/
    (app)/          role-guarded dashboards and workspaces
    api/            REST endpoints (auth, inventory, indents, transfers, stvs, stock-out, eod, returns, alerts, batches, products, users)
    login/          split-screen sign-in with demo shortcuts
  components/       app shell (sidebar/navbar/bell), UI kit
  db/               Drizzle schema (Postgres)
  lib/              auth/JWT/RBAC, expiry rules, inventory & FEFO services, order services, STV state machine, automation, seed
  middleware.ts     JWT cookie route protection
public/images/      MediCare brand logo and pharmacy sign-in illustration (local SVG assets)
```

## Local commands

```bash
npx drizzle-kit push     # apply schema
npm run dev              # develop
npm run build && npm start
```

Data seeds automatically on first `/api/health` hit or first login. Central Admin can rebuild the
demo dataset with `POST /api/seed`.

---

## Running this project locally

1. **Install Node.js 20+** and PostgreSQL 14+.
2. Unzip this archive and install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the project root (already included in this archive):
   ```
   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
   JWT_SECRET=change-this-in-production
   ```
4. Create the database schema:
   ```bash
   npx drizzle-kit push
   ```
5. Start the app:
   ```bash
   npm run dev      # development — http://localhost:3000
   # or
   npm run build && npm start
   ```
6. Open `http://localhost:3000`. Demo data (warehouse, branches, products, batches with
   5 expiry windows, indents, STVs) is seeded automatically on the first request.

### Sign in
| Role | Email | Password |
| --- | --- | --- |
| Central Admin | `nelkasehan@gmail.com` | `nelka123` |

Other users (branch managers, pharmacists, warehouse staff) are created by the administrator in
**Users & roles**, or directly from **Branches → Staff**. Remember to assign a **location** to every
branch-scoped account — without a location a pharmacist cannot dispense stock.

### Useful commands
```bash
npx drizzle-kit push     # apply schema changes
npm run typecheck        # TypeScript
npm run lint             # ESLint
npm run build            # production build
```

### Project structure
```
src/
  app/                 Next.js App Router
    (app)/             role-guarded workspaces (dashboard, inventory, stvs, indents, …)
    api/               REST endpoints (auth, inventory, indents, transfers, stvs, stock-out, eod, returns, alerts, batches, branches, products, users)
    login/             split-screen sign-in
  components/          app shell (sidebar/navbar), UI kit, charts, theme
  db/                  Drizzle schema + Postgres client
  lib/                 auth/JWT/RBAC, expiry rules, FEFO & velocity, STV state machine, automation, seed
  middleware.ts        route protection
public/images/         MediCare logo and pharmacy sign-in illustration
```

---

## ▶️ Run it in the VS Code terminal

1. **Extract** the zip, then open the folder in VS Code:
   ```bash
   unzip medicare-erp-source.zip -d medi-care-erp
   code medi-care-erp
   ```
2. Open the integrated terminal in VS Code: **`Ctrl + \``** (backtick) or menu
   *Terminal → New Terminal*.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Make sure **PostgreSQL is running**, then check `.env` (included in the zip):
   ```
   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
   JWT_SECRET=change-this-in-production
   ```
   Change the URL if your database user/password/host differs.
5. Create the tables:
   ```bash
   npx drizzle-kit push
   ```
6. Start the development server:
   ```bash
   npm run dev
   ```
7. Open **http://localhost:3000** in the browser.

Sign in with `nelkasehan@gmail.com` / `nelka123`. Demo data (warehouse, branches,
products, batches across 5 expiry windows, indents, STVs) seeds automatically on
the first request — no manual seeding step needed.

**Useful VS Code tips**
- Run commands one by one in the same terminal; wait for `npm install` to finish.
- If port 3000 is busy: `npm run dev -- -p 3001`.
- To stop the server: `Ctrl + C` in the terminal.
- To rebuild for production: `npm run build` then `npm start`.
